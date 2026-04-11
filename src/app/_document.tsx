import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* AVANTLINK AFFILIATE APPLICATION VERIFICATION SCRIPT - TEMPORARY - DELETE AFTER APPROVAL */}
        <script
          type="text/javascript"
          src="http://classic.avantlink.com/affiliate_app_confirm.php?mode=js&authResponse=20d071dee7649107b0746ce9716f6da2575dd4de"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
