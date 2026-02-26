import { describe, expect, it } from 'vitest';
import { resolveSchemaPolicy } from '../schema-policy';

describe('resolveSchemaPolicy', () => {
  describe('exact path matching', () => {
    it('matches /overview to softwareApplication', () => {
      const result = resolveSchemaPolicy({ url: '/overview' });
      expect(result.ruleId).toBe('overview-software-application');
      expect(result.primarySchema).toBe('softwareApplication');
    });

    it('matches /api-reference to collectionPage', () => {
      const result = resolveSchemaPolicy({ url: '/api-reference' });
      expect(result.ruleId).toBe('hub-collection-page');
      expect(result.primarySchema).toBe('collectionPage');
    });
  });

  describe('suffix matching (/**/)', () => {
    it('matches /**/overview for nested overview pages', () => {
      const result = resolveSchemaPolicy({ url: '/guides/agent/overview' });
      expect(result.ruleId).toBe('hub-collection-page');
      expect(result.primarySchema).toBe('collectionPage');
    });

    it('does not match /guides/overview-extra for /**/overview', () => {
      const result = resolveSchemaPolicy({ url: '/guides/overview-extra' });
      expect(result.ruleId).toBe('default-tech-article');
    });
  });

  describe('prefix matching (/**)', () => {
    it('does NOT match /api-reference-v2/foo for /api-reference pattern', () => {
      const result = resolveSchemaPolicy({ url: '/api-reference-v2/foo' });
      expect(result.ruleId).toBe('default-tech-article');
      expect(result.primarySchema).toBe('techArticle');
    });
  });

  describe('wildcard catch-all', () => {
    it('falls back to techArticle for arbitrary paths', () => {
      const result = resolveSchemaPolicy({ url: '/some/random/page' });
      expect(result.ruleId).toBe('default-tech-article');
      expect(result.primarySchema).toBe('techArticle');
    });
  });

  describe('HowTo step heading counting', () => {
    it('includes HowTo when >= 3 step headings', () => {
      const result = resolveSchemaPolicy({
        url: '/guides/setup',
        tocTitles: ['Step 1: Install', 'Step 2: Configure', 'Step 3: Deploy'],
      });
      expect(result.includeHowTo).toBe(true);
    });

    it('does not include HowTo with < 3 step headings', () => {
      const result = resolveSchemaPolicy({
        url: '/guides/setup',
        tocTitles: ['Step 1: Install', 'Step 2: Configure'],
      });
      expect(result.includeHowTo).toBe(false);
    });

    it('does not include HowTo for non-article schemas', () => {
      const result = resolveSchemaPolicy({
        url: '/overview',
        tocTitles: ['Step 1: Install', 'Step 2: Configure', 'Step 3: Deploy'],
      });
      expect(result.includeHowTo).toBe(false);
    });
  });

  describe('URL normalization', () => {
    it('strips trailing slashes', () => {
      const result = resolveSchemaPolicy({ url: '/overview/' });
      expect(result.ruleId).toBe('overview-software-application');
    });

    it('strips query parameters', () => {
      const result = resolveSchemaPolicy({ url: '/overview?ref=home' });
      expect(result.ruleId).toBe('overview-software-application');
    });

    it('strips hash fragments', () => {
      const result = resolveSchemaPolicy({ url: '/overview#section' });
      expect(result.ruleId).toBe('overview-software-application');
    });

    it('adds leading slash if missing', () => {
      const result = resolveSchemaPolicy({ url: 'overview' });
      expect(result.ruleId).toBe('overview-software-application');
    });
  });
});
