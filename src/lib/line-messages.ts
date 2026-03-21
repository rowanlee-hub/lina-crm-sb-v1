/**
 * Build LINE message objects from a message string that may contain media tags.
 *
 * Supported tags (placed on their own line in the message):
 *   [image:https://example.com/photo.jpg]
 *   [video:https://example.com/clip.mp4]
 *   [video:https://example.com/clip.mp4|https://example.com/thumb.jpg]
 *
 * Returns an array of LINE message objects (max 5 per push).
 * Text around media tags is grouped into text messages.
 */

interface LineMessage {
  type: 'text' | 'image' | 'video';
  text?: string;
  originalContentUrl?: string;
  previewImageUrl?: string;
}

const MEDIA_TAG_RE = /^\[(?:image|video):([^\]]+)\]$/i;

export function buildLineMessages(rawMessage: string): LineMessage[] {
  if (!rawMessage || !rawMessage.trim()) return [];

  const lines = rawMessage.split('\n');
  const messages: LineMessage[] = [];
  let textBuffer: string[] = [];

  function flushText() {
    const text = textBuffer.join('\n').trim();
    if (text) {
      messages.push({ type: 'text', text });
    }
    textBuffer = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(MEDIA_TAG_RE);

    if (match) {
      // Flush any accumulated text first
      flushText();

      const tagType = trimmed.match(/^\[(image|video):/i)![1].toLowerCase();
      const content = match[1];

      if (tagType === 'image') {
        messages.push({
          type: 'image',
          originalContentUrl: content,
          previewImageUrl: content, // LINE uses same URL for preview if not specified
        });
      } else if (tagType === 'video') {
        const parts = content.split('|');
        const videoUrl = parts[0].trim();
        const previewUrl = parts[1]?.trim() || '';
        messages.push({
          type: 'video',
          originalContentUrl: videoUrl,
          previewImageUrl: previewUrl || videoUrl, // fallback
        });
      }
    } else {
      textBuffer.push(line);
    }
  }

  // Flush remaining text
  flushText();

  // LINE API allows max 5 messages per push
  return messages.slice(0, 5);
}

/**
 * Check if a message contains any media tags.
 */
export function hasMedia(message: string): boolean {
  return message.split('\n').some(line => MEDIA_TAG_RE.test(line.trim()));
}
