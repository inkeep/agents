/**
 * Targeted TypeScript Placeholder System
 *
 * Uses AST parsing to intelligently identify large content blocks for replacement:
 * - prompt: (template literals or strings)
 * - description: (string literals)
 * - inputSchema: (object literals)
 * - detailsSchema: (object literals)
 * - props: (object literals in artifact/data components)
 */

import { randomBytes } from 'node:crypto';
import { Project, Node, SyntaxKind } from 'ts-morph';

interface TargetedPlaceholderResult {
  processedContent: string;
  replacements: Record<string, string>;
  stats: {
    originalSize: number;
    processedSize: number;
    savings: number;
    savingsPercentage: number;
    replacedFields: number;
  };
}

/**
 * Generate a unique placeholder ID
 */
function generatePlaceholderId(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

/**
 * Minimum length threshold for replacement (only replace if longer than this)
 */
const MIN_REPLACEMENT_LENGTH = 10; // Lowered from 80 to catch more fields

/**
 * Create targeted placeholders using AST parsing for better accuracy
 */
export function createTargetedTypeScriptPlaceholders(
  content: string,
  debug: boolean = false
): TargetedPlaceholderResult {
  const replacements: Record<string, string> = {};
  let replacedFields = 0;
  const originalSize = content.length;

  try {
    // Create a temporary project to parse the TypeScript
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile("temp.ts", content);

    // Track all replacements to apply them in order
    const replacementOperations: Array<{
      start: number;
      end: number;
      placeholder: string;
      originalText: string;
    }> = [];

    // Find all object literal expressions with specific property names
    sourceFile.forEachDescendant((node) => {
      if (Node.isPropertyAssignment(node)) {
        const propertyName = node.getName();
        const valueNode = node.getInitializer();
        
        if (!valueNode) return;

        // Get the exact text that will be replaced (no trimming to match boundaries)
        let valueText = valueNode.getText();
        if (valueText.trim().length < MIN_REPLACEMENT_LENGTH) return;

        let placeholderPrefix = '';
        
        // Check if this is a field we want to replace
        switch (propertyName) {
          case 'prompt':
            placeholderPrefix = 'PROMPT';
            break;
          case 'description':
            placeholderPrefix = 'DESC';
            break;
          case 'inputSchema':
            placeholderPrefix = 'INPUT_SCHEMA';
            break;
          case 'detailsSchema':
            placeholderPrefix = 'DETAILS_SCHEMA';
            break;
          case 'props':
            placeholderPrefix = 'PROPS';
            break;
          default:
            return; // Skip this property
        }

        // Get precise boundaries and fix them if needed
        const start = valueNode.getStart();
        let end = valueNode.getEnd();
        
        // Validate that the boundaries don't extend beyond the property assignment
        const propertyAssignment = node; // The PropertyAssignment node
        const propertyEnd = propertyAssignment.getEnd();
        
        // For inputSchema specifically, we need to find the actual end of the object
        if (propertyName === 'inputSchema') {
          // The inputSchema should end after the closing brace and comma
          // Let's search from the start position forward to find the correct boundary
          let searchStart = start;
          let braceCount = 0;
          let correctEnd = -1;
          let inString = false;
          let stringChar = '';
          
          for (let i = searchStart; i < content.length; i++) {
            const char = content[i];
            const prevChar = i > 0 ? content[i - 1] : '';
            
            // Handle string literals
            if ((char === '"' || char === "'") && prevChar !== '\\') {
              if (!inString) {
                inString = true;
                stringChar = char;
              } else if (char === stringChar) {
                inString = false;
                stringChar = '';
              }
            }
            
            if (!inString) {
              if (char === '{') {
                braceCount++;
              } else if (char === '}') {
                braceCount--;
                
                // When we close all braces and find a comma, that's our end
                if (braceCount === 0) {
                  // Look ahead for comma and whitespace
                  let j = i + 1;
                  while (j < content.length && /\s/.test(content[j])) {
                    j++;
                  }
                  if (j < content.length && content[j] === ',') {
                    correctEnd = j + 1; // Include the comma
                    break;
                  }
                }
              }
            }
          }
          
          if (correctEnd > start && correctEnd < end + 100) { // Sanity check
            end = correctEnd;
            valueText = content.slice(start, end);
          }
        } else {
          // For other properties, check if AST boundary is incorrect
          const textAfterValue = content.slice(end, end + 20);
          if (!textAfterValue.match(/^\s*[,}]/)) {
            // Search backwards from the AST end position to find the actual value end
            let correctEnd = end;
            while (correctEnd > start && !content.slice(correctEnd, correctEnd + 10).match(/^\s*[,}]/)) {
              correctEnd--;
            }
            
            if (correctEnd > start) {
              end = correctEnd;
              valueText = content.slice(start, end);
            } else {
              return; // Skip this replacement to avoid corruption
            }
          }
        }
        
        // If the value boundary extends beyond the property boundary, something is wrong
        if (end > propertyEnd) {
          return;
        }
        
        const actualText = content.slice(start, end);
        
        // Ensure getText() matches the actual slice - this is critical for correctness
        if (valueText !== actualText) {
          return; // Skip this replacement to avoid corruption
        }
        
        // Final validation: ensure the replacement doesn't contain parts of other properties
        const finalTextAfterValue = content.slice(end, end + 20);
        if (!finalTextAfterValue.match(/^\s*[,}]/)) {
          return;
        }

        // Create placeholder and track replacement
        const placeholder = `<${placeholderPrefix}_${generatePlaceholderId()}>`;
        replacements[placeholder] = valueText; // Store exact text that matches boundaries
        replacedFields++;

        // Use exact boundaries that match the getText() result
        replacementOperations.push({
          start: start,
          end: end,
          placeholder,
          originalText: valueText // This now matches what we'll actually replace
        });
      }
    });

    // Apply replacements from end to beginning to maintain positions
    replacementOperations.sort((a, b) => b.start - a.start);
    
    let processedContent = content;
    for (const op of replacementOperations) {
      processedContent = 
        processedContent.slice(0, op.start) + 
        op.placeholder + 
        processedContent.slice(op.end);
    }

    const processedSize = processedContent.length;
    const savings = originalSize - processedSize;
    const savingsPercentage = originalSize > 0 ? (savings / originalSize) * 100 : 0;

    return {
      processedContent,
      replacements,
      stats: {
        originalSize,
        processedSize,
        savings,
        savingsPercentage,
        replacedFields,
      },
    };

  } catch (error) {
    // Fallback to original content if AST parsing fails
    return {
      processedContent: content,
      replacements: {},
      stats: {
        originalSize,
        processedSize: originalSize,
        savings: 0,
        savingsPercentage: 0,
        replacedFields: 0,
      },
    };
  }
}

/**
 * Restore placeholders in TypeScript content
 */
export function restoreTargetedTypeScriptPlaceholders(
  content: string,
  replacements: Record<string, string>
): string {
  let restoredContent = content;

  // Sort by placeholder length (longest first) to avoid partial replacements
  const sortedPlaceholders = Object.keys(replacements).sort((a, b) => b.length - a.length);

  for (const placeholder of sortedPlaceholders) {
    const originalValue = replacements[placeholder];

    // Skip if placeholder doesn't exist in content
    if (!restoredContent.includes(placeholder)) {
      continue;
    }

    // Simple string replacement (placeholders are unique and safe)
    restoredContent = restoredContent.replace(placeholder, originalValue);
  }

  return restoredContent;
}
