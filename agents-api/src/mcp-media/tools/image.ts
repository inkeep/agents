import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import sharp from 'sharp';
import { z } from 'zod';

const MAX_IMAGE_BASE64_BYTES = 25 * 1024 * 1024;

type ImageInput = { data: string; mimeType: string };

export const imageInputSchema = z.object({
  data: z.string().describe('Base64-encoded image bytes'),
  mimeType: z.string().describe('MIME type of the image (e.g. "image/png", "image/jpeg")'),
});

function decodeBase64Image(imageBase64: ImageInput): Buffer {
  if (imageBase64.data.length > MAX_IMAGE_BASE64_BYTES) {
    throw new Error(`Image exceeds maximum allowed size of 25MB.`);
  }
  return Buffer.from(imageBase64.data, 'base64');
}

export function registerImageTools(server: McpServer): void {
  server.registerTool(
    'image_info',
    {
      description: 'Get metadata about an image: dimensions, format, channels, and file size.',
      inputSchema: z.object({
        image: imageInputSchema.describe('Image object with base64 data and mimeType'),
      }),
    },
    async ({ image }): Promise<CallToolResult> => {
      try {
        const buffer = decodeBase64Image(image);
        const metadata = await sharp(buffer).metadata();
        const info = {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          channels: metadata.channels,
          hasAlpha: metadata.hasAlpha,
          sizeBytes: buffer.byteLength,
        };
        return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Image info failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'image_crop',
    {
      description: 'Crop a region from an image. Returns the cropped image as base64.',
      inputSchema: z.object({
        image: imageInputSchema.describe('Image to crop'),
        x: z.number().describe('Left edge of the crop region (pixels)'),
        y: z.number().describe('Top edge of the crop region (pixels)'),
        width: z.number().describe('Width of the crop region (pixels)'),
        height: z.number().describe('Height of the crop region (pixels)'),
      }),
    },
    async ({ image, x, y, width, height }): Promise<CallToolResult> => {
      try {
        const buffer = decodeBase64Image(image);
        const { data, info } = await sharp(buffer)
          .extract({ left: x, top: y, width, height })
          .toBuffer({ resolveWithObject: true });

        const mimeType = `image/${info.format ?? 'png'}`;
        return {
          content: [{ type: 'image', data: data.toString('base64'), mimeType }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Crop failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'image_resize',
    {
      description: 'Resize an image. Returns the resized image as base64.',
      inputSchema: z.object({
        image: imageInputSchema.describe('Image to resize'),
        width: z.number().optional().describe('Target width in pixels'),
        height: z.number().optional().describe('Target height in pixels'),
        maintainAspect: z
          .boolean()
          .optional()
          .describe(
            'Maintain aspect ratio (default: true). Ignored if both width and height are provided.'
          ),
        fit: z
          .enum(['contain', 'cover', 'fill', 'inside', 'outside'])
          .optional()
          .describe('Resize fit strategy when both dimensions are given (default: "inside")'),
      }),
    },
    async ({
      image,
      width,
      height,
      maintainAspect = true,
      fit = 'inside',
    }): Promise<CallToolResult> => {
      if (!width && !height) {
        return {
          content: [{ type: 'text', text: 'At least one of width or height must be provided.' }],
          isError: true,
        };
      }

      try {
        const buffer = decodeBase64Image(image);
        const resizeOptions: sharp.ResizeOptions = { fit };
        if (width) resizeOptions.width = width;
        if (height) resizeOptions.height = height;
        if (!width || !height) {
          resizeOptions.fit = maintainAspect ? 'inside' : 'fill';
        }

        const { data, info } = await sharp(buffer)
          .resize(resizeOptions)
          .toBuffer({ resolveWithObject: true });

        const mimeType = `image/${info.format ?? 'png'}`;
        return {
          content: [{ type: 'image', data: data.toString('base64'), mimeType }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Resize failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
