# RA ONE SMC Dashboard

This repository no longer hosts the RA ONE SMC dashboard on GitHub Pages.

The dashboard should run locally on the Windows machine that contains the RA ONE signal journals and engine logs. Keeping it local avoids publishing account, Discord, trade, signal, or engine activity data to the web.

Local run command:

```powershell
cd C:\Users\neera\OneDrive\Desktop\discord
.\run_local_dashboard.ps1
```

The local dashboard rebuilds its data from the local journal/log files and opens on `http://localhost:<port>/`.
