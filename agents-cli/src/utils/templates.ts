import path from 'node:path';
import degit from 'degit';
import fs from 'fs-extra';

export interface ContentReplacement {
  /** Relative file path within the cloned template */
  filePath: string;
  /** Object property replacements - key is the property path, value is the replacement content */
  replacements: Record<string, any>;
}

//Duplicating function here so we dont have to add a dependency on the agents-cli package
export async function cloneTemplate(
  templatePath: string,
  targetPath: string,
  replacements?: ContentReplacement[]
) {
  await fs.mkdir(targetPath, { recursive: true });

  const templatePathSuffix = templatePath.replace('https://github.com/', '');
  const emitter = degit(templatePathSuffix);
  try {
    await emitter.clone(targetPath);

    // Apply content replacements if provided
    if (replacements && replacements.length > 0) {
      await replaceContentInFiles(targetPath, replacements);
    }
  } catch (_error) {
    process.exit(1);
  }
}

export async function cloneTemplateLocal(
  templatePath: string,
  targetPath: string,
  replacements: ContentReplacement[]
) {
  await fs.mkdir(targetPath, { recursive: true });

  try {
    await fs.copy(templatePath, targetPath, {
      overwrite: true,
      errorOnExist: false,
    });

    if (replacements && replacements.length > 0) {
      await replaceContentInFiles(targetPath, replacements);
    }
  } catch (error) {
    console.error(`Failed to clone template from ${templatePath}:`, error);
    process.exit(1);
  }
}

/**
 * Replace content in cloned template files
 */
export async function replaceContentInFiles(
  targetPath: string,
  replacements: ContentReplacement[]
) {
  for (const replacement of replacements) {
    const filePath = path.join(targetPath, replacement.filePath);

    // Check if file exists
    if (!(await fs.pathExists(filePath))) {
      console.warn(`Warning: File ${filePath} not found, skipping replacements`);
      continue;
    }

    // Read the file content
    const content = await fs.readFile(filePath, 'utf-8');

    // Apply replacements
    const updatedContent = await replaceObjectProperties(content, replacement.replacements);

    // Write back to file
    await fs.writeFile(filePath, updatedContent, 'utf-8');
  }
}

/**
 * Replace object properties in TypeScript code content
 */
export async function replaceObjectProperties(
  content: string,
  replacements: Record<string, any>
): Promise<string> {
  let updatedContent = content;
  for (const [propertyPath, replacement] of Object.entries(replacements)) {
    updatedContent = replaceObjectProperty(updatedContent, propertyPath, replacement);
  }

  return updatedContent;
}

/**
 * Replace a specific object property in TypeScript code
 * This implementation uses line-by-line parsing for better accuracy
 * If the property doesn't exist, it will be added to the object
 */
function replaceObjectProperty(content: string, propertyPath: string, replacement: any): string {
  // Check if this is a single-line object format first (object all on one line)
  const singleLineMatch = content.match(
    new RegExp(`^(.+{[^{}]*${propertyPath}\\s*:\\s*{[^{}]*}[^{}]*}.*)$`, 'm')
  );
  if (singleLineMatch) {
    // For single-line objects, handle replacement inline
    const singleLinePattern = new RegExp(`((^|\\s|{)${propertyPath}\\s*:\\s*)({[^}]*})`);
    return content.replace(
      singleLinePattern,
      `$1${JSON.stringify(replacement).replace(/"/g, "'").replace(/:/g, ': ').replace(/,/g, ', ')}`
    );
  }

  // Convert replacement to formatted JSON string with proper indentation
  const replacementStr = JSON.stringify(replacement, null, 2).replace(/"/g, "'"); // Use single quotes for consistency with TS

  const lines = content.split('\n');
  const result: string[] = [];
  let inTargetProperty = false;
  let braceCount = 0;
  let targetPropertyIndent = '';
  let foundProperty = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip if we're currently inside the target property
    if (inTargetProperty) {
      // Count braces to track nesting
      for (const char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }

      // When braceCount reaches 0, we've found the end of the property
      if (braceCount <= 0) {
        // Check if there's a trailing comma on this line or the original property line
        const hasTrailingComma =
          line.includes(',') ||
          (i + 1 < lines.length &&
            lines[i + 1].trim().startsWith('}') === false &&
            lines[i + 1].trim() !== '');

        // Add the replacement with proper indentation
        const indentedReplacement = replacementStr
          .split('\n')
          .map((replacementLine, index) => {
            if (index === 0) {
              return `${targetPropertyIndent}${propertyPath}: ${replacementLine}`;
            }
            return `${targetPropertyIndent}${replacementLine}`;
          })
          .join('\n');

        result.push(`${indentedReplacement}${hasTrailingComma ? ',' : ''}`);
        inTargetProperty = false;
        foundProperty = true;
        continue;
      }
      // Skip all lines while inside the target property
      continue;
    }

    // Check if this line contains the target property at the right level
    const propertyPattern = new RegExp(`(^|\\s+)${propertyPath}\\s*:`);
    if (trimmedLine.startsWith(`${propertyPath}:`) || propertyPattern.test(line)) {
      inTargetProperty = true;
      braceCount = 0;
      // For single-line objects, use base indentation plus 2 spaces for properties
      if (line.includes(' = { ')) {
        // Single-line format: use base indentation
        targetPropertyIndent = `${line.match(/^\s*/)?.[0] || ''}  `;
      } else {
        // Multi-line format: calculate from property position
        const propertyMatch = line.match(new RegExp(`(.*?)(^|\\s+)${propertyPath}\\s*:`));
        targetPropertyIndent = propertyMatch ? propertyMatch[1] : line.match(/^\s*/)?.[0] || '';
      }

      // Count braces in the current line
      for (const char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }

      // If the property definition is on a single line (braceCount = 0)
      if (braceCount <= 0) {
        const hasTrailingComma = line.includes(',');
        const indentedReplacement = replacementStr
          .split('\n')
          .map((replacementLine, index) => {
            if (index === 0) {
              return `${targetPropertyIndent}${propertyPath}: ${replacementLine}`;
            }
            return `${targetPropertyIndent}${replacementLine}`;
          })
          .join('\n');

        result.push(`${indentedReplacement}${hasTrailingComma ? ',' : ''}`);
        inTargetProperty = false;
        foundProperty = true;
        continue;
      }
      // Continue to next iteration to process multi-line property
      continue;
    }

    // If we're not in the target property, keep the line as-is
    result.push(line);
  }

  // If property wasn't found, try to inject it into the object
  if (!foundProperty) {
    return injectPropertyIntoObject(result.join('\n'), propertyPath, replacement);
  }

  return result.join('\n');
}

/**
 * Inject a new property into a TypeScript object when the property doesn't exist
 */
function injectPropertyIntoObject(content: string, propertyPath: string, replacement: any): string {
  const replacementStr = JSON.stringify(replacement, null, 2).replace(/"/g, "'"); // Use single quotes for consistency with TS

  const lines = content.split('\n');
  const result: string[] = [];

  // Find the main object definition (looking for patterns like project({...})
  let foundObjectStart = false;
  let objectDepth = 0;
  let insertionPoint = -1;
  let baseIndent = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Look for object patterns like "project({", "= {", etc.
    if (
      !foundObjectStart &&
      (trimmedLine.includes('({') || trimmedLine.endsWith(' = {') || line.includes(' = { '))
    ) {
      foundObjectStart = true;
      baseIndent = line.match(/^\s*/)?.[0] || '';
      objectDepth = 0;

      // Count braces on this line
      for (const char of line) {
        if (char === '{') objectDepth++;
        if (char === '}') objectDepth--;
      }
    } else if (foundObjectStart) {
      // Track brace depth
      for (const char of line) {
        if (char === '{') objectDepth++;
        if (char === '}') objectDepth--;
      }

      // If we're at the end of the main object, this is our insertion point
      if (objectDepth === 0 && trimmedLine.startsWith('}')) {
        insertionPoint = i;
        break;
      }
    }
  }

  // If we found an insertion point, add the property
  if (insertionPoint !== -1) {
    const propertyIndent = `${baseIndent}  `; // Add 2 spaces for property indent

    // Check if we need a comma before our property
    let needsCommaPrefix = false;
    if (insertionPoint > 0) {
      const prevLine = lines[insertionPoint - 1].trim();
      needsCommaPrefix = prevLine !== '' && !prevLine.endsWith(',') && !prevLine.startsWith('}');
    }

    // Format the property to inject
    const indentedReplacement = replacementStr
      .split('\n')
      .map((replacementLine, index) => {
        if (index === 0) {
          return `${propertyIndent}${propertyPath}: ${replacementLine}`;
        }
        return `${propertyIndent}${replacementLine}`;
      })
      .join('\n');

    // Insert the property before the closing brace
    for (let i = 0; i < lines.length; i++) {
      if (i === insertionPoint) {
        result.push(indentedReplacement);
      }

      // Add comma to previous line if needed and we're at the right position
      if (i === insertionPoint - 1 && needsCommaPrefix) {
        result.push(`${lines[i]},`);
      } else {
        result.push(lines[i]);
      }
    }

    return result.join('\n');
  }

  // If we couldn't find a suitable injection point, warn and return original
  console.warn(`Could not inject property "${propertyPath}" - no suitable object found in content`);
  return content;
}

export async function getAvailableTemplates(
  templatePath: string = 'template-projects'
): Promise<string[]> {
  // Fetch the list of templates from the repo
  const response = await fetch(
    `https://api.github.com/repos/inkeep/agents-cookbook/contents/${templatePath}`
  );
  const contents = await response.json();

  return contents.filter((item: any) => item.type === 'dir').map((item: any) => item.name);
}
