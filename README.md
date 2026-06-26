Route Weather Planner
=====================

Small single-page app that plots a driving route and samples weather along the route using Open-Meteo and OSRM.

What's included
- `index.html` — main page (now references separate CSS/JS)
- `css/style.css` — app styles
- `js/main.js` — app logic and map code

Run locally
- Open `index.html` in a browser, or run a simple static server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Publish to GitHub Pages
1. Create a repository named `routeweather.github.io` on GitHub (you already have one at https://github.com/aaronv6/routeweather.github.io).
2. In this project folder, commit and push to your GitHub repo:

```bash
git add .
git commit -m "Split CSS/JS and add README"
git remote add origin https://github.com/aaronv6/routeweather.github.io.git
git branch -M main
git push -u origin main
```

Notes
- The app uses third-party tile and API services (OpenStreetMap, OSRM, Open-Meteo); no API keys required.
- If the push fails due to authentication, run the push from your machine with your GitHub credentials or set up SSH keys.

