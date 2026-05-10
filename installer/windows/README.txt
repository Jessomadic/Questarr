Questarr Windows Installer
==========================

The installer requires administrator rights. It installs Questarr to Program
Files, creates a Windows service named Questarr, starts it automatically, and
adds an inbound Windows Firewall rule for the bundled Questarr Node runtime.

After installation, open http://localhost:5000 in your browser.

Runtime data is stored in C:\ProgramData\Questarr:

- data\sqlite.db: SQLite database
- data\config.yaml: app configuration
- logs\questarr.log: service process output
- config.env: optional service environment overrides, such as PORT=5001

Uninstalling removes the Windows service and firewall rule. Runtime data in
C:\ProgramData\Questarr is preserved so accidental uninstalls do not delete the
database.
