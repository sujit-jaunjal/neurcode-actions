import { Project, SourceFile, Node, SyntaxKind, ExportDeclaration, ImportDeclaration } from 'ts-morph';
import { glob } from 'glob';
import { join, relative, resolve } from 'path';
import { existsSync } from 'fs';

export interface ExportItem {
  name: string;
  filePath: string;
  signature?: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'const' | 'variable' | 'enum' | 'namespace' | 'default' | 'unknown';
}

export interface ImportItem {
  from: string;
  imports: string[];
  isTypeOnly: boolean;
}

export interface FileMetadata {
  filePath: string;
  exports: ExportItem[];
  imports: ImportItem[];
}

export interface ProjectMap {
  files: Record<string, FileMetadata>;
  globalExports: ExportItem[];
  scannedAt: string;
}

export class ProjectScanner {
  private project: Project;
  private rootDir: string;
  private ignorePatterns: string[];

  constructor(rootDir: string = process.cwd()) {
    this.rootDir = resolve(rootDir);
    this.project = new Project({
      tsConfigFilePath: undefined, // We'll add files manually
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
    });
    this.ignorePatterns = [
      '**/node_modules/**',
      '**/dist/**',
      '**/.git/**',
      '**/build/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/.cache/**',
      '**/*.map',
      '**/*.log',
    ];
  }

  /**
   * Scan the project and extract exports and imports
   */
  async scan(): Promise<ProjectMap> {
    // Find all TypeScript/JavaScript files
    const files = await this.findSourceFiles();
    
    // Add files to ts-morph project
    const sourceFiles: SourceFile[] = [];
    for (const filePath of files) {
      try {
        const sourceFile = this.project.addSourceFileAtPath(filePath);
        sourceFiles.push(sourceFile);
      } catch (error) {
        // Skip files that can't be parsed
        continue;
      }
    }

    // Extract metadata from each file
    const fileMetadata: Record<string, FileMetadata> = {};
    const globalExports: ExportItem[] = [];

    for (const sourceFile of sourceFiles) {
      const filePath = relative(this.rootDir, sourceFile.getFilePath());
      
      try {
        const exports = this.extractExports(sourceFile, filePath);
        const imports = this.extractImports(sourceFile);
        
        fileMetadata[filePath] = {
          filePath,
          exports,
          imports,
        };

        // Add to global exports list
        globalExports.push(...exports);
      } catch (error) {
        // If extraction fails for a file, continue with others
        fileMetadata[filePath] = {
          filePath,
          exports: [],
          imports: [],
        };
      }
    }

    return {
      files: fileMetadata,
      globalExports,
      scannedAt: new Date().toISOString(),
    };
  }

  /**
   * Find all TypeScript/JavaScript source files
   */
  private async findSourceFiles(): Promise<string[]> {
    const patterns = [
      '**/*.ts',
      '**/*.tsx',
      '**/*.js',
      '**/*.jsx',
    ];

    const allFiles: string[] = [];

    for (const pattern of patterns) {
      try {
        const files = await glob(pattern, {
          cwd: this.rootDir,
          ignore: this.ignorePatterns,
          absolute: true,
        });
        allFiles.push(...files);
      } catch (error) {
        // Continue with other patterns if one fails
        continue;
      }
    }

    // Remove duplicates and sort
    return Array.from(new Set(allFiles)).sort();
  }

  /**
   * Extract all exports from a source file
   */
  private extractExports(sourceFile: SourceFile, filePath: string): ExportItem[] {
    const exports: ExportItem[] = [];

    // Get all export declarations
    const exportDeclarations = sourceFile.getExportedDeclarations();

    for (const [name, declarations] of exportDeclarations) {
      for (const declaration of declarations) {
        const exportItem = this.createExportItem(declaration, name, filePath);
        if (exportItem) {
          exports.push(exportItem);
        }
      }
    }

    // Check for default exports
    const defaultExport = sourceFile.getDefaultExportSymbol();
    if (defaultExport) {
      const declaration = defaultExport.getValueDeclaration();
      if (declaration) {
        const exportItem = this.createExportItem(declaration, 'default', filePath);
        if (exportItem) {
          exports.push(exportItem);
        }
      }
    }

    // Check for export * from statements
    const exportStarDeclarations = sourceFile.getExportDeclarations();
    for (const exportDecl of exportStarDeclarations) {
      if (exportDecl.isNamespaceExport()) {
        const moduleSpecifier = exportDecl.getModuleSpecifierValue();
        if (moduleSpecifier) {
          exports.push({
            name: '*',
            filePath,
            type: 'namespace',
          });
        }
      }
    }

    return exports;
  }

  /**
   * Create an ExportItem from a declaration node
   */
  private createExportItem(declaration: Node, name: string, filePath: string): ExportItem | null {
    const kind = declaration.getKind();
    let type: ExportItem['type'] = 'unknown';
    let signature: string | undefined;

    if (kind === SyntaxKind.FunctionDeclaration || kind === SyntaxKind.FunctionExpression) {
      type = 'function';
      signature = this.getFunctionSignature(declaration);
    } else if (kind === SyntaxKind.ClassDeclaration) {
      type = 'class';
      signature = declaration.getText().split('\n')[0] || undefined;
    } else if (kind === SyntaxKind.InterfaceDeclaration) {
      type = 'interface';
      signature = declaration.getText().split('\n')[0] || undefined;
    } else if (kind === SyntaxKind.TypeAliasDeclaration) {
      type = 'type';
      signature = declaration.getText().split('\n')[0] || undefined;
    } else if (kind === SyntaxKind.EnumDeclaration) {
      type = 'enum';
      signature = declaration.getText().split('\n')[0] || undefined;
    } else if (kind === SyntaxKind.ModuleDeclaration) {
      type = 'namespace';
      signature = declaration.getText().split('\n')[0] || undefined;
    } else if (kind === SyntaxKind.VariableDeclaration) {
      const varDecl = declaration.asKind(SyntaxKind.VariableDeclaration);
      if (varDecl) {
        const initializer = varDecl.getInitializer();
        if (initializer?.getKind() === SyntaxKind.ArrowFunction || 
            initializer?.getKind() === SyntaxKind.FunctionExpression) {
          type = 'function';
          signature = this.getFunctionSignature(initializer);
        } else {
          type = 'const';
          signature = varDecl.getText();
        }
      } else {
        type = 'variable';
      }
    } else if (kind === SyntaxKind.Identifier && name === 'default') {
      type = 'default';
    }

    return {
      name,
      filePath,
      signature,
      type,
    };
  }

  /**
   * Get function signature as a string
   */
  private getFunctionSignature(node: Node): string {
    try {
      const text = node.getText();
      // Extract function signature (name and parameters)
      const match = text.match(/(?:async\s+)?(?:function\s+)?(\w+)?\s*\([^)]*\)/);
      if (match) {
        return match[0];
      }
      // For arrow functions
      const arrowMatch = text.match(/(?:async\s+)?\([^)]*\)\s*=>/);
      if (arrowMatch) {
        return arrowMatch[0];
      }
      return text.split('\n')[0] || '';
    } catch {
      return '';
    }
  }

  /**
   * Extract all imports from a source file
   */
  private extractImports(sourceFile: SourceFile): ImportItem[] {
    const imports: ImportItem[] = [];
    const importDeclarations = sourceFile.getImportDeclarations();

    for (const importDecl of importDeclarations) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      if (!moduleSpecifier) continue;

      const isTypeOnly = importDecl.isTypeOnly();
      const namedImports: string[] = [];
      const defaultImport = importDecl.getDefaultImport();

      // Get named imports
      const namedImportsNode = importDecl.getNamedImports();
      if (namedImportsNode) {
        for (const specifier of namedImportsNode) {
          const importName = specifier.getName();
          namedImports.push(importName);
        }
      }

      // Get namespace import
      const namespaceImport = importDecl.getNamespaceImport();
      if (namespaceImport) {
        namedImports.push(`* as ${namespaceImport.getText()}`);
      }

      // Combine default and named imports
      const allImports: string[] = [];
      if (defaultImport) {
        allImports.push('default');
      }
      allImports.push(...namedImports);

      if (allImports.length > 0 || moduleSpecifier) {
        imports.push({
          from: moduleSpecifier,
          imports: allImports,
          isTypeOnly,
        });
      }
    }

    return imports;
  }
}

