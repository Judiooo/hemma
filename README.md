# Hemma

A self-hosted personal home dashboard for managing local services, bookmarks, and service availability from a single browser page.

Home Portal is designed primarily for trusted local networks and can be deployed as a single Docker container.

## Features

- Local services and bookmarks in a customizable dashboard
- CRUD management for services, bookmarks, and categories
- Favorites section
- Drag-and-drop card sorting
- Local search plus external search engine selection
- Light, dark, and system themes
- Custom wallpapers, uploaded backgrounds, and background history
- Date, time, and weather widgets
- Weather via Open-Meteo — no API key required
- Service health monitoring with:
  - HTTP/HTTPS checks
  - TCP checks
  - ICMP checks
- Availability history with uptime, latency, and incidents
- Configurable health-check interval and timeout
- Manual service re-check
- Favicon and service icon support
- Import/export of portal configuration as JSON
- SQLite persistence outside the container
- Responsive desktop, tablet, and mobile layout
- Docker Compose deployment
- Backend logging without intentionally exposing sensitive values

## Screenshots

Add screenshots here when the project is published, for example:

```text
docs/screenshots/dashboard.png
docs/screenshots/monitoring.png
```

## Requirements

### Docker

- Docker
- Docker Compose

### Development without Docker

- Node.js 20+

## Quick Start

Clone the repository:

```bash
git clone <YOUR_REPOSITORY_URL>
cd <REPOSITORY_DIRECTORY>
```

Start the application:

```bash
docker compose up -d --build
```

Open:

```text
http://<SERVER_IP>:8000/
```

For example:

```text
http://192.168.1.11:8000/
```

Check logs:

```bash
docker compose logs -f
```

Stop the application:

```bash
docker compose down
```

Rebuild after code changes:

```bash
docker compose up -d --build
```

## Data Persistence

The SQLite database is stored on the host:

```text
./data/app.db
```

The Docker Compose configuration mounts:

```text
./data:/app/data
```

This means the database survives container recreation and application updates.

User-uploaded backgrounds are also stored in the `data` directory.

The `data` directory should not be committed to Git.

## Configuration

The default Docker configuration publishes the application on port `8000`:

```yaml
ports:
  - "8000:3000"
```

To use another host port, change the left side:

```yaml
ports:
  - "80:3000"
```

The application itself listens on port `3000` inside the container.

The database path is configured with:

```yaml
environment:
  - PORT=3000
  - DB_PATH=/app/data/app.db
```

## Health Monitoring

Each service can use its own health-check method:

| Method | What it checks |
|---|---|
| HTTP/HTTPS | Sends an HTTP request and measures response time |
| TCP | Measures the time required to establish a TCP connection |
| ICMP | Sends an ICMP echo request |

For example, a local service such as:

```text
http://192.168.1.118:9117/
```

can be monitored using TCP on port `9117` when the goal is to verify that the service is reachable and accepting connections.

HTTP latency represents the time required to receive the HTTP response, not ICMP ping latency.

Health-check results are stored in SQLite and retained for 30 days.

## Development Without Docker

Install dependencies:

```bash
cd app
npm install
```

Start the server:

```bash
DB_PATH=./data/app.db PORT=3000 node server.js
```

Open:

```text
http://localhost:3000/
```

On Windows PowerShell, environment variables can be set with:

```powershell
$env:DB_PATH="./data/app.db"
$env:PORT="3000"
node server.js
```

## Project Structure

```text
.
├── app/
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js
│   ├── public/
│   │   ├── index.html
│   │   ├── style.css
│   │   ├── app.js
│   │   └── icons/
│   └── src/
│       ├── db.js
│       ├── healthcheck.js
│       ├── history.js
│       ├── logger.js
│       ├── probe.js
│       ├── speedtest.js
│       └── routes/
├── data/
│   └── .gitkeep
├── docker-compose.yml
├── DESIGN.md
└── README.md
```

## Architecture

```text
Browser
   │
   │ HTTP
   ▼
Express / Node.js
   │
   ├── REST API
   ├── Health-check worker
   ├── Speed test
   └── SQLite
         │
         ▼
      ./data
```

The frontend is built with plain HTML, CSS, and JavaScript and does not require a separate frontend build step.

The backend uses:

- Node.js
- Express
- SQLite
- better-sqlite3

## Third-Party Assets

Home Portal may use service icons from third-party icon collections, including
[Dashboard Icons](https://github.com/homarr-labs/dashboard-icons) and
[Simple Icons](https://simpleicons.org/).

Dashboard Icons is distributed under the **Apache License 2.0**. The relevant
license and attribution requirements apply to the third-party assets and do
not change the licensing terms of the Home Portal source code.

When redistributing third-party assets covered by Apache License 2.0, the
applicable license, copyright notices, attribution notices, and any required
`NOTICE` information must be retained. Modified files must also contain an
appropriate notice indicating that they were changed.

Brand names, logos, product names, trademarks, and registered trademarks
belong to their respective owners. Icons are used for identification purposes
only and do not imply endorsement, sponsorship, affiliation, or approval by
the respective trademark owners.

The Apache License 2.0 license for third-party assets does not grant
permission to use third-party trademarks or brand names beyond the rights
provided by their respective owners.

Simple Icons may also be served through its external CDN. Its collection
license does not waive third-party trademark, patent, or brand-guideline
restrictions.

## Security

Home Portal currently does **not** provide built-in user authentication.

It is intended primarily for use inside a trusted local network.

If the application needs to be exposed beyond a trusted LAN, put it behind an authentication-capable reverse proxy or VPN.

Examples of suitable deployment patterns include:

```text
Internet
   │
   ▼
Reverse Proxy + Authentication
   │
   ▼
Home Portal
```

Do not expose the application directly to the public Internet without considering authentication and access control.

## Backup

The application provides JSON configuration export/import.

Use the built-in backup functionality to export the portal configuration before making major changes.

For a complete backup, also preserve the `data` directory because it contains the SQLite database and user-uploaded background files.

## Notes

- The application is optimized for self-hosted/local-network usage.
- External websites may behave differently depending on their HTTP response, redirects, firewall rules, or anti-bot protection.
- Health-check latency is measured from the Home Portal server/container, not from the user's browser.
- HTTP checks consider successful server communication even when the target returns a non-success HTTP status, depending on the configured probe behavior.

## License

### Home Portal

The Home Portal source code is **not currently released under an open-source
license**.

The repository is published for viewing and educational purposes. All rights
are reserved unless separate written permission is granted by the copyright
holder.

Without such permission, you should not assume that the Home Portal source
code may be modified, redistributed, commercially used, relicensed, or
incorporated into other projects.

### Third-party assets

Third-party assets included in or used by the project remain subject to their
respective licenses.

In particular, Dashboard Icons is licensed under the **Apache License 2.0**.
The Apache License 2.0 permits use, reproduction, modification, and
distribution of covered material subject to its terms and conditions.

The Apache License 2.0 for third-party assets does **not** grant rights to the
Home Portal source code, nor does it grant trademark rights to the brands
represented by the icons.

See the applicable third-party license and attribution notices distributed
with the project for the exact terms.
