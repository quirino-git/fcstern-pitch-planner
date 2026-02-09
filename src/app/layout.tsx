import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        {/* FullCalendar CSS via CDN (weil in deinem Setup keine CSS-Dateien in node_modules vorhanden sind) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@fullcalendar/core@6.1.20/index.global.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@fullcalendar/timegrid@6.1.20/index.global.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
