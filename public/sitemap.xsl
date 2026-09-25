<?xml version="1.0" encoding="UTF-8"?>
<!--
  Renders /sitemap.xml as a readable page when a person opens it in a browser.
  Search engines read the XML directly and ignore this file.
-->
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9">
  <xsl:output method="html" encoding="UTF-8" indent="yes" />
  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>Sitemap · Pharmacy Commons</title>
        <style>
          body { margin: 0; background: #faf9f5; color: #10271f; font: 16px/1.6 system-ui, sans-serif; }
          main { max-width: 48rem; margin: 0 auto; padding: 2.5rem 1rem 4rem; }
          h1 { font: 600 2rem/1.1 Georgia, serif; margin: 0 0 .75rem; }
          p { color: #045d48; margin: 0 0 2rem; }
          a { color: #007b5f; text-underline-offset: 2px; overflow-wrap: anywhere; }
          table { width: 100%; border-collapse: collapse; font-size: 15px; }
          th { text-align: left; font-weight: 600; border-bottom: 2px solid #a1f6d8; padding: .5rem .25rem; }
          td { border-bottom: 1px solid #d8f9ec; padding: .5rem .25rem; vertical-align: top; }
          td.date { white-space: nowrap; color: #045d48; width: 7rem; }
        </style>
      </head>
      <body>
        <main>
          <h1>Sitemap</h1>
          <p>
            Every page on Pharmacy Commons that search engines are asked to index
            (<xsl:value-of select="count(s:urlset/s:url)" /> pages).
            This is the <a href="/sitemap.xml">sitemap.xml</a> file shown in a readable form.
            <a href="/">Back to Pharmacy Commons</a>.
          </p>
          <table>
            <thead>
              <tr><th>Page</th><th>Last updated</th></tr>
            </thead>
            <tbody>
              <xsl:for-each select="s:urlset/s:url">
                <tr>
                  <td><a href="{s:loc}"><xsl:value-of select="s:loc" /></a></td>
                  <td class="date"><xsl:value-of select="s:lastmod" /></td>
                </tr>
              </xsl:for-each>
            </tbody>
          </table>
        </main>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
