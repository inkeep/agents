/**
 * Simple token usage tracking and cost calculation for pull-v2
 * Assumes Claude Sonnet 4.5 pricing
 */

import chalk from 'chalk';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface LLMCall {
  operation: string;
  usage: TokenUsage;
  duration: number;
}

// Claude Sonnet 4.5 pricing per 1M tokens
const SONNET_45_PRICING = {
  input: {
    under200k: 3.00,    // $3 / MTok for prompts ≤ 200K tokens
    over200k: 6.00      // $6 / MTok for prompts > 200K tokens
  },
  output: {
    under200k: 15.00,   // $15 / MTok for prompts ≤ 200K tokens  
    over200k: 22.50     // $22.50 / MTok for prompts > 200K tokens
  }
};

export class TokenTracker {
  private calls: LLMCall[] = [];

  /**
   * Record an LLM call with its usage information
   */
  recordCall(operation: string, usage: TokenUsage, duration: number): void {
    this.calls.push({
      operation,
      usage,
      duration
    });
  }

  /**
   * Calculate cost based on Claude Sonnet 4.5 tiered pricing
   */
  calculateCost(inputTokens: number, outputTokens: number): number {
    // Determine pricing tier based on input tokens (prompt size)
    const inputRate = inputTokens > 200_000 
      ? SONNET_45_PRICING.input.over200k 
      : SONNET_45_PRICING.input.under200k;
      
    const outputRate = inputTokens > 200_000
      ? SONNET_45_PRICING.output.over200k
      : SONNET_45_PRICING.output.under200k;

    // Convert from per 1M tokens to actual usage
    const inputCost = (inputTokens / 1_000_000) * inputRate;
    const outputCost = (outputTokens / 1_000_000) * outputRate;
    
    return inputCost + outputCost;
  }

  /**
   * Log the final usage summary
   */
  logSummary(): void {
    const totalInputTokens = this.calls.reduce((sum, call) => sum + call.usage.inputTokens, 0);
    const totalOutputTokens = this.calls.reduce((sum, call) => sum + call.usage.outputTokens, 0);
    const totalTokens = totalInputTokens + totalOutputTokens;
    const totalDuration = this.calls.reduce((sum, call) => sum + call.duration, 0);
    const totalCost = this.calculateCost(totalInputTokens, totalOutputTokens);
    
    console.log(chalk.cyan('\n💰 LLM Usage & Cost'));
    console.log(chalk.gray('─'.repeat(40)));
    
    // Token usage
    console.log(chalk.white(`📊 Tokens: ${totalTokens.toLocaleString()} total`));
    console.log(chalk.gray(`   • Input: ${totalInputTokens.toLocaleString()}`));
    console.log(chalk.gray(`   • Output: ${totalOutputTokens.toLocaleString()}`));
    
    // Duration and calls
    console.log(chalk.white(`⏱️  Time: ${(totalDuration / 1000).toFixed(1)}s (${this.calls.length} calls)`));
    
    // Cost
    const costFormatted = totalCost < 0.01 ? '< $0.01' : `$${totalCost.toFixed(4)}`;
    console.log(chalk.yellow(`💵 Cost: ${costFormatted} USD`));
    
    // Show pricing tier used
    const tierUsed = totalInputTokens > 200_000 ? 'over 200K' : 'under 200K';
    console.log(chalk.gray(`   • Tier: ${tierUsed} tokens`));
    
    console.log(chalk.gray('─'.repeat(40)));
  }

  /**
   * Clear all recorded calls
   */
  clear(): void {
    this.calls = [];
  }
}

// Global token tracker instance
export const tokenTracker = new TokenTracker();

/**
 * Extract token usage from AI SDK response
 */
export function extractTokenUsage(response: any): TokenUsage | null {
  const usage = response.usage || response.response?.usage;
  
  if (usage) {
    const inputTokens = usage.promptTokens || usage.inputTokens || 0;
    const outputTokens = usage.completionTokens || usage.outputTokens || 0;
    
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens
    };
  }
  
  return null;
}