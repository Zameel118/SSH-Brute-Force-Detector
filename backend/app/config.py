"""
Application settings loaded from environment variables / .env file.
All thresholds and paths are configurable so Simulation Mode works out of the box.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Mode ---
    # "simulation" = fake logs + simulated blocks; "live" = real log + real ufw
    mode: str = "simulation"

    # --- Paths ---
    # In simulation mode we write/read our own fake auth log
    simulated_log_path: str = "./data/simulated_auth.log"
    # In live mode, point this at the real SSH auth log
    live_log_path: str = "/var/log/auth.log"
    database_url: str = "sqlite:///./data/detector.db"

    # --- Detection thresholds (failed attempts within the time window) ---
    alert_threshold: int = 5          # first warning
    rate_limit_threshold: int = 10    # second stage
    block_threshold: int = 15         # full block
    time_window_minutes: int = 10     # sliding window size

    # --- Block duration ---
    unblock_after_hours: int = 24

    # --- Safety: never block these ---
    admin_ip: str = "127.0.0.1"
    # Always protected regardless of config
    protected_ips: str = "127.0.0.1,::1,localhost"

    # --- Optional SMTP email alerts (no-op if host is empty) ---
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "ssh-detector@localhost"
    smtp_to: str = ""

    # --- API ---
    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://localhost"

    @property
    def log_path(self) -> str:
        """Return the log file the detector should currently watch."""
        if self.mode == "live":
            return self.live_log_path
        return self.simulated_log_path

    @property
    def protected_ip_set(self) -> set[str]:
        ips = {ip.strip() for ip in self.protected_ips.split(",") if ip.strip()}
        if self.admin_ip:
            ips.add(self.admin_ip.strip())
        return ips

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
