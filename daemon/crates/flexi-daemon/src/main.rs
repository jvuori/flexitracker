//! flexi-worker daemon: monitor idle/session state, emit debounced back-dated
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

use flexi_core::{ActivityEvent, EventKind, MachineDescriptor};

use config::Config;
use idle::{IdleSource, Sample, SimulatedIdle};
use outbox::Outbox;
use state_machine::{Persisted, StateMachine, Tick};

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
}

struct Args {
    account_key: Option<String>,
    backend_url: Option<String>,
    config_path: Option<PathBuf>,
    simulate: bool,
    once: bool,
}

fn parse_args() -> Result<Args, String> {
    let mut a = Args {
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
            "--account-key" => a.account_key = Some(take()?),
            "--backend-url" => a.backend_url = Some(take()?),
            "--config" => a.config_path = Some(PathBuf::from(take()?)),
            "--simulate" => a.simulate = true,
            "--once" => a.once = true,
            "--version" | "-V" => {
                println!("flexi-worker {}", env!("CARGO_PKG_VERSION"));
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
        "flexi-worker — activity tracking daemon\n\n\
         USAGE:\n    flexi-worker [--account-key KEY] [--backend-url URL] [OPTIONS]\n\n\
         OPTIONS:\n    \
         --account-key KEY   Per-machine access key (saved to config on first run)\n    \
         --backend-url URL   Backend base URL (saved to config)\n    \
         --config PATH       Config file path (default: ~/.config/flexi-worker/config.toml)\n    \
         --simulate          Post a synthetic day through the real pipeline and exit\n    \
         --once              Take a single reading, flush, and exit\n    \
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
    let args = parse_args().map_err(|e| {
        print_help();
        e
    })?;
    let config_path = args.config_path.clone().unwrap_or_else(Config::default_path);

    // Load or bootstrap the config from CLI flags.
    let mut cfg = Config::load(&config_path).ok().unwrap_or_else(|| Config {
        backend_url: String::new(),
        access_key: String::new(),
        account_id: None,
        machine_id: None,
        thresholds: Default::default(),
    });
    if let Some(k) = args.account_key {
        cfg.access_key = k;
    }
    if let Some(u) = args.backend_url {
        cfg.backend_url = u;
    }
    if cfg.access_key.is_empty() || cfg.backend_url.is_empty() {
        return Err("missing access key or backend url (pass --account-key and --backend-url once)".into());
    }
    cfg.save(&config_path).map_err(|e| format!("cannot write config: {e}"))?;

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

    loop {
        let s: Sample = source.sample().map_err(|e| format!("idle sample: {e}"))?;
        let events = sm.step(Tick { now: now_ms(), idle_ms: s.idle_ms, locked: s.locked });
        ob.append(&events).map_err(|e| e.to_string())?;
        save_state(&state_path, &sm.p);
        flush(&cfg, &mut ob);
        if args.once {
            return Ok(());
        }
        std::thread::sleep(std::time::Duration::from_millis(thresholds.poll_ms as u64));
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
fn save_state(path: &std::path::Path, p: &Persisted) {
    if let Ok(text) = serde_json::to_string(p) {
        let _ = std::fs::write(path, text);
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
        ActivityEvent { ts: day + 8 * h, kind: EventKind::Active },
        ActivityEvent { ts: day + 10 * h, kind: EventKind::Idle },
        ActivityEvent { ts: day + 13 * h, kind: EventKind::Active },
        ActivityEvent { ts: day + 16 * h, kind: EventKind::Idle },
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
