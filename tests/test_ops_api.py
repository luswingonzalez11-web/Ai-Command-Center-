from pathlib import Path
import importlib.util
MODULE_PATH = Path(__file__).resolve().parents[1] / "ops_api.py"
SPEC = importlib.util.spec_from_file_location("ops_api_under_test", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

def test_database_status_reports_missing_database(tmp_path):
    assert MODULE._database_status(tmp_path / "missing.sqlite") == {"status":"not_initialized"}

def test_database_status_checks_sqlite_integrity(tmp_path):
    import sqlite3
    database = tmp_path / "healthy.sqlite"
    with sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE sample (id INTEGER PRIMARY KEY)")
    assert MODULE._database_status(database) == {"status":"ok"}

def test_database_status_handles_invalid_database(tmp_path):
    database = tmp_path / "broken.sqlite"
    database.write_text("not a sqlite database", encoding="utf-8")
    assert MODULE._database_status(database) == {"status":"degraded"}

def test_dependency_probe_returns_boolean():
    assert isinstance(MODULE._dependency_status("json"), bool)
