// Run with: node update-devto.js
// Updates the Dev.to article with cover image and inline screenshot

const ARTICLE_ID = 3480416;
const API_KEY = 'vwzUyEpwcD5SbwZ6tvyUnq2V';
const IMAGE_URL = 'https://raw.githubusercontent.com/Idevelopusefulstuff/chatgpt-auto-approve/main/screenshot.png';

async function main() {
  // First, fetch the current article to get its body_markdown
  const getRes = await fetch(`https://dev.to/api/articles/${ARTICLE_ID}`, {
    headers: { 'api-key': API_KEY }
  });
  if (!getRes.ok) {
    console.error('Failed to fetch article:', getRes.status, await getRes.text());
    process.exit(1);
  }
  const article = await getRes.json();
  console.log('Current title:', article.title);

  let body = article.body_markdown;

  // Add image after "## The Solution" if not already present
  if (!body.includes('screenshot.png')) {
    body = body.replace(
      '## The Solution',
      `## The Solution\n\n![ChatGPT Auto Approve extension popup](${IMAGE_URL})`
    );
    console.log('Added screenshot image to body');
  } else {
    console.log('Screenshot already in body');
  }

  // PATCH the article
  const patchRes = await fetch(`https://dev.to/api/articles/${ARTICLE_ID}`, {
    method: 'PUT',
    headers: {
      'api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      article: {
        cover_image: IMAGE_URL,
        body_markdown: body
      }
    })
  });

  if (!patchRes.ok) {
    console.error('Failed to update article:', patchRes.status, await patchRes.text());
    process.exit(1);
  }

  const updated = await patchRes.json();
  console.log('Article updated successfully!');
  console.log('Cover image:', updated.cover_image);
  console.log('URL:', updated.url);
}

main().catch(err => { console.error(err); process.exit(1); });
