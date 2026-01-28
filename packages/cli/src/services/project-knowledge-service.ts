/**
 * Project Knowledge Service
 * 
 * Detects and maintains persistent knowledge about project tech stack and architecture.
 * This service provides context-aware information that helps the Architect make better decisions.
 * 
 * Features:
 * - Tech stack detection (Node.js, Python, Go)
 * - Architecture pattern detection and memory
 * - Persistent storage in .neurcode/architecture.json
 * - Natural language project summaries
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

/**
 * Architecture pattern types
 */
export type ArchitecturePattern = 'monorepo' | 'nextjs-app' | 'layered' | 'modular' | 'feature-based' | 'mvc' | 'unknown';

/**
 * Architecture memory schema
 */
const ArchitectureMemorySchema = z.object({
  pattern: z.enum(['monorepo', 'nextjs-app', 'layered', 'modular', 'feature-based', 'mvc', 'unknown']),
  invariants: z.array(z.string()),
  domainBoundaries: z.array(z.string()),
});

export type ArchitectureMemory = z.infer<typeof ArchitectureMemorySchema>;

/**
 * Tech stack information
 */
export interface TechStack {
  language: 'typescript' | 'javascript' | 'python' | 'go' | 'unknown';
  framework?: string;
  orm?: string;
  styling?: string;
  buildTool?: string;
  packageManager?: string;
  version?: string;
}

/**
 * Project summary combining tech stack and architecture
 */
export interface ProjectSummary {
  techStack: TechStack;
  architecture: ArchitectureMemory;
  summary: string; // Natural language summary
}

export class ProjectKnowledgeService {
  /**
   * Detect tech stack from project root
   */
  async detectTechStack(rootPath: string): Promise<TechStack> {
    const techStack: TechStack = {
      language: 'unknown',
    };

    // Try Python first (requirements.txt or pyproject.toml)
    const requirementsPath = join(rootPath, 'requirements.txt');
    const pyprojectPath = join(rootPath, 'pyproject.toml');
    if (existsSync(requirementsPath) || existsSync(pyprojectPath)) {
      techStack.language = 'python';
      
      if (existsSync(requirementsPath)) {
        try {
          const requirements = readFileSync(requirementsPath, 'utf-8');
          techStack.framework = this.detectPythonFramework(requirements);
          techStack.orm = this.detectPythonORM(requirements);
        } catch (error) {
          console.warn('Failed to read requirements.txt:', error);
        }
      }

      if (existsSync(pyprojectPath)) {
        try {
          const pyproject = readFileSync(pyprojectPath, 'utf-8');
          // Simple parsing for pyproject.toml (basic implementation)
          if (pyproject.includes('django')) {
            techStack.framework = 'django';
          } else if (pyproject.includes('fastapi')) {
            techStack.framework = 'FastAPI';
          } else if (pyproject.includes('flask')) {
            techStack.framework = 'flask';
          }
        } catch (error) {
          console.warn('Failed to read pyproject.toml:', error);
        }
      }

      return techStack;
    }

    // Try Node.js (package.json)
    const packageJsonPath = join(rootPath, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        
        // Detect language: typescript if in devDependencies, otherwise javascript
        const deps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };
        techStack.language = deps['typescript'] ? 'typescript' : 'javascript';
        
        techStack.packageManager = this.detectPackageManager(rootPath);
        techStack.version = packageJson.version;

        // Detect framework (next, react, express, nest, fastify)
        techStack.framework = this.detectNodeFramework(packageJson);

        // Detect ORM (prisma, typeorm, mongoose, sequelize)
        techStack.orm = this.detectNodeORM(packageJson);

        // Detect styling
        techStack.styling = this.detectStyling(packageJson);

        // Detect build tool
        techStack.buildTool = this.detectBuildTool(packageJson);

        return techStack;
      } catch (error) {
        console.warn('Failed to parse package.json:', error);
      }
    }

    // Try Go (go.mod)
    const goModPath = join(rootPath, 'go.mod');
    if (existsSync(goModPath)) {
      try {
        const goMod = readFileSync(goModPath, 'utf-8');
        techStack.language = 'go';
        
        // Extract module name and version
        const moduleMatch = goMod.match(/^module\s+(\S+)/m);
        if (moduleMatch) {
          techStack.version = moduleMatch[1];
        }

        // Detect Go framework
        techStack.framework = this.detectGoFramework(goMod);
        techStack.orm = this.detectGoORM(goMod);

        return techStack;
      } catch (error) {
        console.warn('Failed to read go.mod:', error);
      }
    }

    return techStack;
  }

  /**
   * Detect Node.js framework from package.json
   * Returns lowercase framework names: next, react, express, nest, fastify, django, flask
   */
  private detectNodeFramework(packageJson: any): string | undefined {
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    // Priority order: next, react, express, nest, fastify
    if (deps['next']) return 'next';
    if (deps['react']) return 'react';
    if (deps['express']) return 'express';
    if (deps['nest'] || deps['@nestjs/core']) return 'nest';
    if (deps['fastify']) return 'fastify';

    // Check scripts for framework hints
    if (packageJson.scripts) {
      if (packageJson.scripts.dev?.includes('next')) return 'next';
      if (packageJson.scripts.start?.includes('next')) return 'next';
    }

    return undefined;
  }

  /**
   * Detect Node.js ORM from package.json
   * Returns lowercase ORM names: prisma, typeorm, mongoose, sequelize
   */
  private detectNodeORM(packageJson: any): string | undefined {
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    // Priority order: prisma, typeorm, mongoose, sequelize
    if (deps['prisma'] || deps['@prisma/client']) return 'prisma';
    if (deps['typeorm']) return 'typeorm';
    if (deps['mongoose']) return 'mongoose';
    if (deps['sequelize']) return 'sequelize';

    return undefined;
  }

  /**
   * Detect styling library from package.json
   */
  private detectStyling(packageJson: any): string | undefined {
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    if (deps['tailwindcss']) return 'Tailwind CSS';
    if (deps['@mui/material'] || deps['@material-ui/core']) return 'Material UI';
    if (deps['styled-components']) return 'Styled Components';
    if (deps['emotion']) return 'Emotion';
    if (deps['sass'] || deps['node-sass']) return 'Sass';
    if (deps['less']) return 'Less';
    if (deps['bootstrap']) return 'Bootstrap';

    return undefined;
  }

  /**
   * Detect build tool from package.json
   */
  private detectBuildTool(packageJson: any): string | undefined {
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    if (deps['vite']) return 'Vite';
    if (deps['webpack']) return 'Webpack';
    if (deps['rollup']) return 'Rollup';
    if (deps['esbuild']) return 'esbuild';
    if (deps['turbo']) return 'Turborepo';
    if (deps['nx']) return 'Nx';

    return undefined;
  }

  /**
   * Detect package manager from lock files
   */
  private detectPackageManager(rootPath: string): string | undefined {
    if (existsSync(join(rootPath, 'pnpm-lock.yaml'))) return 'pnpm';
    if (existsSync(join(rootPath, 'yarn.lock'))) return 'yarn';
    if (existsSync(join(rootPath, 'package-lock.json'))) return 'npm';
    if (existsSync(join(rootPath, 'bun.lockb'))) return 'bun';

    return undefined;
  }

  /**
   * Detect Python framework from requirements.txt
   * Returns lowercase framework names: django, flask
   */
  private detectPythonFramework(requirements: string): string | undefined {
    const lowerRequirements = requirements.toLowerCase();

    // Priority order: django, flask
    if (lowerRequirements.includes('django')) return 'django';
    if (lowerRequirements.includes('flask')) return 'flask';

    return undefined;
  }

  /**
   * Detect Python ORM from requirements.txt
   */
  private detectPythonORM(requirements: string): string | undefined {
    const lowerRequirements = requirements.toLowerCase();

    if (lowerRequirements.includes('sqlalchemy')) return 'SQLAlchemy';
    if (lowerRequirements.includes('django') && lowerRequirements.includes('orm')) return 'Django ORM';
    if (lowerRequirements.includes('peewee')) return 'Peewee';
    if (lowerRequirements.includes('tortoise-orm')) return 'Tortoise ORM';
    if (lowerRequirements.includes('prisma') || lowerRequirements.includes('prisma-client')) return 'Prisma';

    return undefined;
  }

  /**
   * Detect Go framework from go.mod
   */
  private detectGoFramework(goMod: string): string | undefined {
    if (goMod.includes('github.com/gin-gonic/gin')) return 'Gin';
    if (goMod.includes('github.com/gorilla/mux')) return 'Gorilla Mux';
    if (goMod.includes('github.com/labstack/echo')) return 'Echo';
    if (goMod.includes('github.com/go-chi/chi')) return 'Chi';
    if (goMod.includes('github.com/beego/beego')) return 'Beego';

    return undefined;
  }

  /**
   * Detect Go ORM from go.mod
   */
  private detectGoORM(goMod: string): string | undefined {
    if (goMod.includes('gorm.io/gorm')) return 'GORM';
    if (goMod.includes('github.com/jinzhu/gorm')) return 'GORM (legacy)';
    if (goMod.includes('github.com/volatiletech/sqlboiler')) return 'SQLBoiler';
    if (goMod.includes('github.com/go-pg/pg')) return 'go-pg';

    return undefined;
  }

  /**
   * Detect architecture pattern from folder structure
   * Priority: monorepo > nextjs-app > layered > modular > feature-based > mvc > unknown
   */
  private detectArchitecturePattern(rootPath: string): ArchitecturePattern {
    // 1. Check for Monorepo (Highest Priority)
    const hasPackages = existsSync(join(rootPath, 'packages'));
    const hasWorkspaces = existsSync(join(rootPath, 'pnpm-workspace.yaml')) || existsSync(join(rootPath, 'lerna.json'));
    
    if (hasPackages || hasWorkspaces) {
      return 'monorepo';
    }

    // 2. Check for Next.js (App Router or Pages)
    const hasApp = existsSync(join(rootPath, 'src', 'app')) || existsSync(join(rootPath, 'app'));
    const hasPages = existsSync(join(rootPath, 'src', 'pages')) || existsSync(join(rootPath, 'pages'));
    
    if (hasApp || hasPages) {
      return 'nextjs-app';
    }

    // 3. Check for Layered Architecture (Backend)
    const hasControllers = existsSync(join(rootPath, 'src', 'controllers')) || existsSync(join(rootPath, 'controllers'));
    const hasServices = existsSync(join(rootPath, 'src', 'services')) || existsSync(join(rootPath, 'services'));
    
    if (hasControllers || hasServices) {
      return 'layered';
    }

    // 4. Fallback for generic Node/TS projects
    if (existsSync(join(rootPath, 'src'))) {
      return 'modular'; 
    }

    return 'unknown';
  }

  /**
   * Detect domain boundaries from folder structure
   */
  private detectDomainBoundaries(rootPath: string): string[] {
    const boundaries: string[] = [];

    // Check common patterns
    const srcPath = join(rootPath, 'src');
    if (existsSync(srcPath)) {
      // Feature-based boundaries
      if (existsSync(join(srcPath, 'modules'))) {
        boundaries.push('src/modules/*');
      }
      if (existsSync(join(srcPath, 'features'))) {
        boundaries.push('src/features/*');
      }
      if (existsSync(join(srcPath, 'domains'))) {
        boundaries.push('src/domains/*');
      }

      // App Router (Next.js)
      if (existsSync(join(srcPath, 'app'))) {
        boundaries.push('src/app/**/route.ts');
        boundaries.push('src/app/**/page.tsx');
      }

      // Layered architecture boundaries
      if (existsSync(join(srcPath, 'controllers'))) {
        boundaries.push('src/controllers/*');
      }
      if (existsSync(join(srcPath, 'services'))) {
        boundaries.push('src/services/*');
      }
      if (existsSync(join(srcPath, 'models'))) {
        boundaries.push('src/models/*');
      }
    }

    // Django apps
    if (existsSync(join(rootPath, 'apps'))) {
      boundaries.push('apps/*');
    }

    return boundaries;
  }

  /**
   * Generate default invariants based on architecture pattern
   */
  private generateDefaultInvariants(pattern: ArchitecturePattern): string[] {
    const invariants: string[] = [];

    switch (pattern) {
      case 'monorepo':
        invariants.push('Respect package boundaries.');
        break;

      case 'nextjs-app':
        invariants.push('Use server actions or API routes for backend logic.');
        break;

      case 'layered':
        invariants.push('Controllers should not call DB directly; use Services.');
        break;

      case 'modular':
        invariants.push('Follow existing project structure');
        break;

      case 'mvc':
        invariants.push('Models should not contain business logic');
        invariants.push('Views should not contain business logic');
        invariants.push('Controllers should delegate to services');
        break;

      case 'feature-based':
        invariants.push('Features should be self-contained modules');
        invariants.push('No cross-feature dependencies without interfaces');
        invariants.push('Shared code should be in common/shared directory');
        break;

      case 'unknown':
        invariants.push('Follow existing project structure');
        break;
    }

    return invariants;
  }

  /**
   * Read architecture memory from .neurcode/architecture.json
   */
  async readArchitectureMemory(rootPath: string): Promise<ArchitectureMemory | null> {
    const neurcodeDir = join(rootPath, '.neurcode');
    const architecturePath = join(neurcodeDir, 'architecture.json');

    if (!existsSync(architecturePath)) {
      return null;
    }

    try {
      const content = readFileSync(architecturePath, 'utf-8');
      const parsed = JSON.parse(content);
      const validated = ArchitectureMemorySchema.parse(parsed);
      return validated;
    } catch (error) {
      console.warn('Failed to read or validate architecture.json:', error);
      return null;
    }
  }

  /**
   * Write architecture memory to .neurcode/architecture.json
   */
  async writeArchitectureMemory(rootPath: string, memory: ArchitectureMemory): Promise<void> {
    const neurcodeDir = join(rootPath, '.neurcode');
    const architecturePath = join(neurcodeDir, 'architecture.json');

    // Ensure .neurcode directory exists
    if (!existsSync(neurcodeDir)) {
      mkdirSync(neurcodeDir, { recursive: true });
    }

    // Validate before writing
    const validated = ArchitectureMemorySchema.parse(memory);

    // Write to file
    writeFileSync(architecturePath, JSON.stringify(validated, null, 2), 'utf-8');
  }

  /**
   * Initialize architecture memory with defaults based on folder structure
   */
  async initializeArchitectureMemory(rootPath: string): Promise<ArchitectureMemory> {
    const pattern = this.detectArchitecturePattern(rootPath);
    const domainBoundaries = this.detectDomainBoundaries(rootPath);
    const invariants = this.generateDefaultInvariants(pattern);

    const memory: ArchitectureMemory = {
      pattern,
      invariants,
      domainBoundaries,
    };

    // Save to disk
    await this.writeArchitectureMemory(rootPath, memory);

    return memory;
  }

  /**
   * Get or create architecture memory (reads from disk or initializes)
   * Implements Read-Through Caching: if file doesn't exist, detect and save immediately
   */
  async getArchitectureMemory(rootPath: string): Promise<ArchitectureMemory> {
    // Try to read existing file first
    const existing = await this.readArchitectureMemory(rootPath);
    if (existing) {
      return existing;
    }

    // File doesn't exist - detect architecture and save immediately (Read-Through Cache)
    const pattern = this.detectArchitecturePattern(rootPath);
    const domainBoundaries = this.detectDomainBoundaries(rootPath);
    const invariants = this.generateDefaultInvariants(pattern);

    const memory: ArchitectureMemory = {
      pattern,
      invariants,
      domainBoundaries,
    };

    // CRITICAL: Write to disk immediately so future runs are faster
    await this.writeArchitectureMemory(rootPath, memory);

    return memory;
  }

  /**
   * Generate natural language project summary
   */
  async getProjectSummary(rootPath: string): Promise<ProjectSummary> {
    const techStack = await this.detectTechStack(rootPath);
    const architecture = await this.getArchitectureMemory(rootPath);

    // Build natural language summary
    const parts: string[] = [];

    // Tech stack description
    if (techStack.language !== 'unknown') {
      const stackParts: string[] = [];

      if (techStack.framework) {
        stackParts.push(techStack.framework);
      } else {
        // Fallback to language name
        const languageNames: Record<string, string> = {
          node: 'Node.js',
          python: 'Python',
          go: 'Go',
        };
        stackParts.push(languageNames[techStack.language] || techStack.language);
      }

      if (techStack.orm) {
        stackParts.push(`using ${techStack.orm}`);
      }

      if (techStack.styling) {
        stackParts.push(`with ${techStack.styling}`);
      }

      if (techStack.buildTool) {
        stackParts.push(`built with ${techStack.buildTool}`);
      }

      parts.push(stackParts.join(' ') + ' project');
    } else {
      parts.push('Unknown technology stack');
    }

    // Architecture description
    if (architecture.pattern !== 'unknown') {
      const patternNames: Record<ArchitecturePattern, string> = {
        'monorepo': 'monorepo architecture',
        'nextjs-app': 'Next.js app architecture',
        'layered': 'layered architecture',
        'modular': 'modular architecture',
        'feature-based': 'feature-based architecture',
        'mvc': 'MVC architecture',
        'unknown': 'unknown architecture',
      };
      parts.push(`Follows ${patternNames[architecture.pattern]}`);
    }

    // Add invariants if present
    if (architecture.invariants.length > 0) {
      parts.push(`Key architectural rules: ${architecture.invariants.slice(0, 2).join(', ')}`);
    }

    const summary = parts.join('. ') + '.';

    return {
      techStack,
      architecture,
      summary,
    };
  }
}
