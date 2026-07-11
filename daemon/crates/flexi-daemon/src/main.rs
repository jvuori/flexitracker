//! flexi-worker daemon.
//!
//! SCAFFOLD: CLI surface only. The idle/session monitoring, debounced
//! hysteresis state machine, persisted crash recovery, config file, and offline
//! outbox are implemented in the activity-daemon tasks.

use std::process::ExitCode;

fn main() -> ExitCode {
    let arg = std::env::args().nth(1);
    match arg.as_deref() {
        Some("--version") | Some("-V") => {
            println!("flexi-worker {}", env!("CARGO_PKG_VERSION"));
            ExitCode::SUCCESS
        }
        Some("--help") | Some("-h") | None => {
            print_help();
            ExitCode::SUCCESS
        }
        Some(other) => {
            // Fail-fast: an unknown invocation is an error, not something to
            // silently ignore.
            eprintln!("error: unknown argument: {other}");
            print_help();
            ExitCode::FAILURE
        }
    }
}

fn print_help() {
    println!(
        "flexi-worker — activity tracking daemon\n\n\
         USAGE:\n    flexi-worker [OPTIONS]\n\n\
         OPTIONS:\n    \
         -V, --version    Print version\n    \
         -h, --help       Print this help\n\n\
         (monitoring, config, and outbox are added by the activity-daemon tasks)"
    );
}
