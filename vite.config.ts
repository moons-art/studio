import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function localYoutubeSearchPlugin(): Plugin {
  return {
    name: 'local-youtube-search',
    configureServer(server) {
      server.middlewares.use('/api/youtube-search', async (req, res) => {
        try {
          const urlObj = new URL(req.url || '', 'http://localhost:5173');
          const query = urlObj.searchParams.get('q') || '';
          if (!query.trim()) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, videos: [] }));
            return;
          }

          const targetUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
          const response = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
            }
          });

          if (!response.ok) {
            res.statusCode = 502;
            res.end(JSON.stringify({ success: false, error: 'YouTube response error' }));
            return;
          }

          const html = await response.text();
          const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/ytInitialData\s*=\s*({.*?});/s);
          if (!match) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, videos: [] }));
            return;
          }

          const parsedData = JSON.parse(match[1]);
          const contents = parsedData.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];

          const videos = [];
          for (const section of contents) {
            const items = section.itemSectionRenderer?.contents || [];
            for (const item of items) {
              const vr = item.videoRenderer;
              if (vr && vr.videoId) {
                const rawThumb =
                  vr.thumbnail?.thumbnails?.[vr.thumbnail.thumbnails.length - 1]?.url ||
                  vr.thumbnail?.thumbnails?.[0]?.url ||
                  `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`;
                const cleanThumb = rawThumb.startsWith('//') ? `https:${rawThumb}` : rawThumb;

                videos.push({
                  videoId: vr.videoId,
                  title: vr.title?.runs?.map((r: any) => r.text).join('') || '',
                  channelTitle: vr.ownerText?.runs?.map((r: any) => r.text).join('') || '',
                  thumbnail: cleanThumb,
                  thumbnailUrl: cleanThumb,
                  duration: vr.lengthText?.simpleText || ''
                });

                if (videos.length >= 20) break;
              }
            }
            if (videos.length >= 20) break;
          }

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, videos }));
        } catch (err: any) {
          console.error('[local-youtube-search] error:', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
        }
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    localYoutubeSearchPlugin(),
  ],
  server: {
    port: 5174,
    strictPort: false,
  },
})

