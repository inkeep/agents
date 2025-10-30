#!/usr/bin/env node

import { createDatabaseClient, createProject, getProject, createArtifactComponent, getArtifactComponentById } from '@inkeep/agents-core';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const dbUrl = process.env.DB_FILE_NAME || 'file:local.db';
const tenantId = 'default';
const projectId = 'default';
const projectName = 'default';
const projectDescription = 'Generated Inkeep Agents project';

async function createCitationArtifact(dbClient, tenantId, projectId) {
  await createArtifactComponent(dbClient)({
    id: 'citation',
    tenantId: tenantId,
    projectId: projectId,
    name: 'citation',
    description: 'Structured factual information extracted from search results',
    props: {
      type: 'object',
      properties: {
        title: {
          description: 'Title of the source document',
          type: 'string',
          inPreview: true,
        },
        url: {
          description: 'URL of the source document',
          type: 'string',
          inPreview: true,
        },
        record_type: {
          description: 'Type of record (documentation, blog, guide, etc.)',
          type: 'string',
          inPreview: true,
        },
        content: {
          description: 'Array of structured content blocks extracted from the document',
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                description: 'Type of content (text, image, video, etc.)',
                type: 'string',
              },
              text: {
                description: 'The actual text content',
                type: 'string',
              },
            },
            required: ['type', 'text'],
            additionalProperties: false,
          },
        },
      },
      required: ['title', 'url', 'record_type', 'content'],
      additionalProperties: false,
    },
  });
}

async function setupProject() {
  console.log('🚀 Setting up your Inkeep Agents project...');
  
  try {
    const dbClient = createDatabaseClient({ url: dbUrl });
    
    // Check if project already exists
    console.log('📋 Checking if project already exists...');
    try {
      const existingProject = await getProject(dbClient)({ 
        id: projectId, 
        tenantId: tenantId 
      });
      
      if (existingProject) {
        console.log('✅ Project already exists in database:', existingProject.name);
        console.log('🎯 Project ID:', projectId);
        console.log('🏢 Tenant ID:', tenantId);
        return;
      }
    } catch (error) {
      // Project doesn't exist, continue with creation
    }
    
    // Create the project in the database
    console.log('📦 Creating project in database...');
    await createProject(dbClient)({
      id: projectId,
      tenantId: tenantId,
      name: projectName,
      description: projectDescription,
      models: {
  "base": {
    "model": "anthropic/claude-sonnet-4-20250514"
  },
  "structuredOutput": {
    "model": "openai/gpt-4.1-mini-2025-04-14"
  },
  "summarizer": {
    "model": "openai/gpt-4.1-nano-2025-04-14"
  }
},
    });
    
    // Create default citation artifact
    console.log('📋 Creating default citation artifact...');
    await createCitationArtifact(dbClient, tenantId, projectId);
    console.log('✅ Citation artifact created successfully!');
    
    console.log('✅ Project created successfully!');
    console.log('🎯 Project ID:', projectId);
    console.log('🏢 Tenant ID:', tenantId);
    console.log('');
    console.log('🎉 Setup complete! Your development servers are running.');
    console.log('');
    console.log('📋 Available URLs:');
    console.log('   - Management UI: http://localhost:3002');
    console.log('   - Runtime API:   http://localhost:3003');
    console.log('');
    console.log('🚀 Ready to build agents!');
    
  } catch (error) {
    console.error('❌ Failed to setup project:', error);
    process.exit(1);
  }
}

setupProject();
