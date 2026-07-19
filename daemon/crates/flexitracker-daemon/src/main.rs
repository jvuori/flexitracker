//! flexitracker daemon: monitor idle/session state, emit debounced back-dated
//! transitions, buffer them in a durable outbox, and flush to the backend.
//!
//! Fail-fast: unexpected conditions abort with a clear message rather than being
//! silently absorbed.

mod config;
mod idle;
mod outbox;
mod sender;
mod state_machine;

use std::path::PathBuf;
use std::process::ExitCode;
use std::time::{SystemTime, UNIX_EPOCH};

use flexitracker_core::{ActivityEvent, EventKind, MachineDescriptor};

use config::Config;
use idle::{IdleSource, Sample};
use outbox::Outbox;
use state_machine::{Persisted, StateMachine, Tick};

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

/// Backend URL baked into the release build (CI sets FLEXITRACKER_BACKEND_URL), so a
/// user normally only supplies the access key. Overridable with --backend-url.
const DEFAULT_BACKEND_URL: Option<&str> = option_env!("FLEXITRACKER_BACKEND_URL");

#[derive(PartialEq)]
enum Cmd {
    /// Run the monitoring daemon (default, no subcommand).
    Daemon,
    /// Write the access key + backend URL to the config, then self-test.
    Configure,
    /// Connectivity self-test: prove the key works, send no activity data.
    Test,
}

struct Args {
    cmd: Cmd,
    account_key: Option<String>,
    backend_url: Option<String>,
    config_path: Option<PathBuf>,
    simulate: bool,
    once: bool,
}

fn parse_args() -> Result<Args, String> {
    let mut a = Args {
        cmd: Cmd::Daemon,
        account_key: None,
        backend_url: None,
        config_path: None,
        simulate: false,
        once: false,
    };
    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        let mut take = || it.next().ok_or_else(|| format!("{arg} requires a value"));
        match arg.as_str() {
            // Subcommands (accepted as the first positional token).
            "configure" => a.cmd = Cmd::Configure,
            "test" | "--check" => a.cmd = Cmd::Test,
            "--account-key" | "--key" => a.account_key = Some(take()?),
            "--backend-url" => a.backend_url = Some(take()?),
            "--config" => a.config_path = Some(PathBuf::from(take()?)),
            "--simulate" => a.simulate = true,
            "--once" => a.once = true,
            "--version" | "-V" => {
                println!("flexitracker {}", env!("CARGO_PKG_VERSION"));
                std::process::exit(0);
            }
            "--help" | "-h" => {
                print_help();
                std::process::exit(0);
            }
            other => return Err(format!("unknown argument: {other}")),
        }
    }
    Ok(a)
}

fn print_help() {
    println!(
        "flexitracker — activity tracking daemon\n\n\
         USAGE:\n    \
         flexitracker configure [--key KEY] [--backend-url URL]   Authorize this machine\n    \
         flexitracker test                                        Check connectivity (sends no data)\n    \
         flexitracker [OPTIONS]                                   Run the daemon\n\n\
         OPTIONS:\n    \
         --key, --account-key KEY   Per-machine access key (saved to config)\n    \
         --backend-url URL   Backend base URL (defaults to the built-in one)\n    \
         --config PATH       Config file path (default: ~/.config/flexitracker/config.toml)\n    \
         --simulate          Post a synthetic day through the real pipeline and exit\n    \
         --once              Take a single reading, flush, and exit\n    \
         --check             Alias for `test`\n    \
         -V, --version       Print version\n    \
         -h, --help          Print this help"
    );
}

fn machine_descriptor() -> MachineDescriptor {
    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown".into());
    let os = std::env::consts::OS.to_string();
    MachineDescriptor { hostname, os }
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), String> {
    let args = parse_args().inspect_err(|_| print_help())?;
    let config_path = args
        .config_path
        .clone()
        .unwrap_or_else(Config::default_path);

    // Load or bootstrap the config from CLI flags.
    let mut cfg = Config::load(&config_path).ok().unwrap_or_else(|| Config {
        backend_url: String::new(),
        access_key: String::new(),
        account_id: None,
        machine_id: None,
        thresholds: Default::default(),
    });
    if let Some(k) = &args.account_key {
        cfg.access_key = k.clone();
    }
    if let Some(u) = &args.backend_url {
        cfg.backend_url = u.clone();
    }
    // Fall back to the URL baked into the release build so users only need a key.
    if cfg.backend_url.is_empty() {
        if let Some(u) = DEFAULT_BACKEND_URL {
            cfg.backend_url = u.to_string();
        }
    }

    // `configure`: prompt for the key if not supplied, persist, then self-test.
    if args.cmd == Cmd::Configure {
        if cfg.access_key.is_empty() {
            cfg.access_key = prompt("Paste your machine access key: ")?;
        }
        if cfg.access_key.is_empty() {
            return Err("no access key provided".into());
        }
        if cfg.backend_url.is_empty() {
            return Err("no backend url (pass --backend-url; releases have one built in)".into());
        }
        cfg.save(&config_path)
            .map_err(|e| format!("cannot write config: {e}"))?;
        println!("Saved config to {}.", config_path.display());
        return self_test(&cfg);
    }

    // `test`: prove connectivity + authorization, sending no activity data.
    if args.cmd == Cmd::Test {
        if cfg.access_key.is_empty() || cfg.backend_url.is_empty() {
            return Err("not configured — run `flexitracker configure --key <KEY>` first".into());
        }
        return self_test(&cfg);
    }

    // Daemon: needs a key + a url.
    if cfg.access_key.is_empty() || cfg.backend_url.is_empty() {
        return Err(
            "missing access key or backend url (run `flexitracker configure --key <KEY>`)".into(),
        );
    }
    cfg.save(&config_path)
        .map_err(|e| format!("cannot write config: {e}"))?;

    // Refresh thresholds from the backend; fall back to cached/defaults offline.
    match sender::fetch_thresholds(&cfg.backend_url, &cfg.access_key, cfg.thresholds.poll_sec) {
        Ok(t) => {
            cfg.thresholds = t;
            cfg.save(&config_path).ok();
        }
        Err(e) => eprintln!("warning: using cached thresholds ({e})"),
    }
    let thresholds = cfg.thresholds.to_thresholds();

    let state_path = config_path.with_file_name("state.json");
    let outbox_path = config_path.with_file_name("outbox.json");
    let mut ob = Outbox::open(outbox_path).map_err(|e| format!("outbox: {e}"))?;
    // A machine offline for months would otherwise grow the queue without limit
    // with events the backend rejects as too old on arrival.
    let dropped = ob.trim_expired(now_ms());
    if dropped > 0 {
        eprintln!("dropped {dropped} outbox event(s) older than the backend edit window");
    }
    ob.set_machine(machine_descriptor()).ok();

    if args.simulate {
        return simulate(&cfg, &mut ob);
    }

    let persisted = load_state(&state_path).unwrap_or_default();
    let mut sm = StateMachine::new(thresholds.clone(), persisted);

    // Reconcile any unobserved downtime (reboot/sleep) on startup.
    let recovered = sm.recover(now_ms());
    ob.append(&recovered).map_err(|e| e.to_string())?;
    save_state(&state_path, &sm.p);
    flush(&cfg, &mut ob);

    let mut source: Box<dyn IdleSource> =
        idle::platform_source().map_err(|e| format!("idle source: {e}"))?;

    // Monotonic reference for suspend detection. Instant does not advance while
    // the machine is suspended but the wall clock does, so differencing the two
    // between ticks isolates time the daemon was frozen — which a wall clock
    // alone cannot distinguish from an NTP step.
    let mut last_mono: Option<std::time::Instant> = None;

    loop {
        let s: Sample = source.sample().map_err(|e| format!("idle sample: {e}"))?;
        let mono_now = std::time::Instant::now();
        let mono_elapsed_ms =
            last_mono.map(|prev| mono_now.duration_since(prev).as_millis() as i64);
        last_mono = Some(mono_now);
        let events = sm.step(Tick {
            now: now_ms(),
            idle_ms: s.idle_ms,
            locked: s.locked,
            mono_elapsed_ms,
        });
        ob.append(&events).map_err(|e| e.to_string())?;
        save_state(&state_path, &sm.p);
        flush(&cfg, &mut ob);
        if args.once {
            return Ok(());
        }
        std::thread::sleep(std::time::Duration::from_millis(thresholds.poll_ms as u64));
    }
}

/// Read a trimmed line from stdin after printing a prompt.
fn prompt(msg: &str) -> Result<String, String> {
    use std::io::Write;
    print!("{msg}");
    std::io::stdout().flush().ok();
    let mut s = String::new();
    std::io::stdin()
        .read_line(&mut s)
        .map_err(|e| e.to_string())?;
    Ok(s.trim().to_string())
}

/// Connectivity self-test: hit the read-only `/whoami`, print the bound account
/// and machine, and confirm no activity data was sent. Fails if the account is
/// not active (e.g. still awaiting admin approval) rather than implying success.
fn self_test(cfg: &Config) -> Result<(), String> {
    println!("Contacting {} …", cfg.backend_url);
    let w = sender::whoami(&cfg.backend_url, &cfg.access_key)?;
    println!("  ✓ Reachable");
    println!("  ✓ Key valid — account: {}", w.email);
    if let Some(label) = &w.machine_label {
        println!("  ✓ This machine: \"{label}\"");
    }
    if w.active {
        println!("  ✓ Account active — no activity data was sent.");
        Ok(())
    } else {
        Err(format!(
            "account is {} — not active yet (nothing was sent)",
            w.status
        ))
    }
}

/// Try to send the queued batch; on success advance the sequence.
fn flush(cfg: &Config, ob: &mut Outbox) {
    if let Some(batch) = ob.next_batch() {
        match sender::post_batch(&cfg.backend_url, &cfg.access_key, &batch) {
            Ok(()) => {
                let _ = ob.ack();
            }
            Err(e) => eprintln!("flush deferred ({} pending): {e}", ob.pending_len()),
        }
    }
}

fn load_state(path: &std::path::Path) -> Option<Persisted> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}
/// Persist via temp + rename. This file is the sole basis for reconstructing the
/// end of a span after an ungraceful shutdown, so a torn write would corrupt
/// exactly the record that exists to survive one.
fn save_state(path: &std::path::Path, p: &Persisted) {
    if let Ok(text) = serde_json::to_string(p) {
        let tmp = path.with_extension("tmp");
        if std::fs::write(&tmp, text).is_ok() {
            let _ = std::fs::rename(&tmp, path);
        }
    }
}

/// Drive the state machine over a scripted day and flush the resulting events —
/// exercises outbox + sender + backend without real hardware.
fn simulate(cfg: &Config, ob: &mut Outbox) -> Result<(), String> {
    let day = {
        let n = now_ms();
        n - (n % 86_400_000)
    };
    let h = 3_600_000i64;
    // active 08:00–10:00, idle, active 13:00–16:00, idle.
    let events = vec![
        ActivityEvent {
            ts: day + 8 * h,
            kind: EventKind::Active,
        },
        ActivityEvent {
            ts: day + 10 * h,
            kind: EventKind::Idle,
        },
        ActivityEvent {
            ts: day + 13 * h,
            kind: EventKind::Active,
        },
        ActivityEvent {
            ts: day + 16 * h,
            kind: EventKind::Idle,
        },
    ];
    ob.append(&events).map_err(|e| e.to_string())?;
    match sender::post_batch(&cfg.backend_url, &cfg.access_key, &ob.next_batch().unwrap()) {
        Ok(()) => {
            ob.ack().ok();
            println!("simulated day posted ({} events)", events.len());
            Ok(())
        }
        Err(e) => Err(format!("simulate post failed: {e}")),
    }
}
