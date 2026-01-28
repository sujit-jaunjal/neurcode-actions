import { NeurcodeConfig, requireApiKey } from './config';

export interface AnalyzeDiffRequest {
  diff: string;
  projectId?: string;
}

export interface AnalyzeDiffResponse {
  logId: string;
  decision: 'allow' | 'warn' | 'block';
  violations: Array<{
    rule: string;
    file: string;
    severity: 'allow' | 'warn' | 'block';
    message?: string;
  }>;
  summary: {
    totalFiles: number;
    totalAdded: number;
    totalRemoved: number;
    files: Array<{
      path: string;
      changeType: 'add' | 'delete' | 'modify' | 'rename';
      added: number;
      removed: number;
    }>;
  };
}

export interface AnalyzeBloatResponse {
  analysis: {
    redundancy: {
      originalLines: number;
      suggestedLines: number;
      redundancyPercentage: number;
      redundantBlocks: Array<{
        lines: [number, number];
        reason: string;
        suggestion: string;
      }>;
      tokenSavings: number;
      costSavings: number;
    };
    intentMatch: {
      matches: boolean;
      confidence: number;
      explanation: string;
      mismatches: Array<{
        file: string;
        reason: string;
      }>;
    };
    recommendation: 'block' | 'warn' | 'allow';
    summary: string;
  };
  sessionId?: string; // Optional - may not be available if session creation fails
  timestamp: string;
}

export class ApiClient {
  private apiUrl: string;
  private apiKey?: string;
  private readonly requestTimeout: number = 300000; // 5 minutes (300,000ms)
  private isRetryingAuth: boolean = false; // Flag to prevent infinite retry loops

  constructor(config: NeurcodeConfig) {
    // API URL will always be set (defaults to production)
    // This check is no longer needed, but kept for safety
    this.apiUrl = (config.apiUrl || 'https://api.neurcode.com').replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = config.apiKey;
  }

  /**
   * Update API key after re-login
   */
  updateApiKey(newApiKey: string) {
    this.apiKey = newApiKey;
  }

  /**
   * Get API key, requiring it if not set
   * Shows helpful error message if missing
   */
  private getApiKey(): string {
    if (this.apiKey) {
      return this.apiKey;
    }
    // Use requireApiKey which shows helpful error message if missing
    return requireApiKey();
  }

  /**
   * Create a fetch request with timeout support
   * Uses AbortController to implement timeout for long-running requests
   */
  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.requestTimeout / 1000}s. The server may still be processing your request.`);
      }
      throw error;
    }
  }

  /**
   * Wrapper for fetch with debug logging on error
   * Logs the exact URL attempted when fetch fails
   */
  private async fetchWithDebug(url: string, options: RequestInit = {}): Promise<Response> {
    try {
      return await this.fetchWithTimeout(url, options);
    } catch (error) {
      // Debug logging: Show the exact URL that failed
      console.error(`\n🔍 [DEBUG] Fetch failed for URL: ${url}`);
      console.error(`🔍 [DEBUG] API Base URL: ${this.apiUrl}`);
      console.error(`🔍 [DEBUG] Error: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && 'code' in error) {
        console.error(`🔍 [DEBUG] Error code: ${(error as any).code}`);
      }
      throw error;
    }
  }

  /**
   * Central request handler with 401 recovery
   * Handles authentication failures gracefully by prompting for re-login
   */
  private async makeRequest<T>(
    url: string,
    options: RequestInit,
    retryOnAuth: boolean = true
  ): Promise<T> {
    // Get API key for authorization
    const apiKey = this.getApiKey();
    const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    
    // Ensure headers exist
    if (!options.headers) {
      options.headers = {};
    }
    const headers = options.headers as Record<string, string>;
    headers['Authorization'] = authHeader;

    try {
      const response = await this.fetchWithDebug(url, options);

      // Check for 401 Unauthorized
      if (response.status === 401) {
        const errorText = await response.text().catch(() => '');
        let errorJson: any = null;
        
        try {
          errorJson = JSON.parse(errorText);
        } catch {
          // Error body is not JSON, use default message
        }

        // If we're already retrying or this is a retry attempt, don't loop
        if (this.isRetryingAuth || !retryOnAuth) {
          const errorMessage = errorJson?.message || errorJson?.error || 'Authentication failed';
          throw new Error(`Error: Authentication failed. Please run 'neurcode login'.`);
        }

        // Check if terminal is interactive
        if (process.stdout.isTTY && !process.env.CI) {
          // Import readline for interactive prompt
          const { createInterface } = await import('readline/promises');
          const { stdin, stdout } = await import('process');

          const rl = createInterface({ input: stdin, output: stdout });
          
          try {
            const answer = await rl.question('❌ Session expired or invalid. Would you like to log in again? (Y/n) ');
            rl.close();

            const shouldRelogin = answer.trim().toLowerCase() !== 'n' && answer.trim().toLowerCase() !== 'no';
            
            if (shouldRelogin) {
              // Set flag to prevent infinite loops
              this.isRetryingAuth = true;

              try {
                // Import and call login command
                const { loginCommand } = await import('./commands/login');
                await loginCommand();

                // Reload config to get new API key
                const { loadConfig } = await import('./config');
                const newConfig = loadConfig();
                if (newConfig.apiKey) {
                  this.updateApiKey(newConfig.apiKey);
                  
                  // Retry the request once with new auth
                  // Create new options object with updated authorization header
                  const newAuthHeader = newConfig.apiKey.startsWith('Bearer ') 
                    ? newConfig.apiKey 
                    : `Bearer ${newConfig.apiKey}`;
                  
                  const retryOptions = {
                    ...options,
                    headers: {
                      ...headers,
                      'Authorization': newAuthHeader,
                    },
                  };

                  // Retry with retry flag set to false to prevent loops
                  const retryResponse = await this.fetchWithDebug(url, retryOptions);
                  
                  if (retryResponse.status === 401) {
                    // Still 401 after login - something is wrong
                    throw new Error(`Error: Authentication failed. Please run 'neurcode login'.`);
                  }

                  if (!retryResponse.ok) {
                    const retryErrorText = await retryResponse.text();
                    throw new Error(`API request failed with status ${retryResponse.status}: ${retryErrorText}`);
                  }

                  return retryResponse.json() as Promise<T>;
                } else {
                  throw new Error(`Error: Authentication failed. Please run 'neurcode login'.`);
                }
              } catch (loginError) {
                // Login failed or was cancelled
                if (loginError instanceof Error && loginError.message.includes('Authentication failed')) {
                  throw loginError;
                }
                throw new Error(`Error: Authentication failed. Please run 'neurcode login'.`);
              } finally {
                // Reset flag
                this.isRetryingAuth = false;
              }
            } else {
              // User declined to login
              throw new Error(`Error: Authentication failed. Please run 'neurcode login'.`);
            }
          } catch (promptError) {
            rl.close();
            throw promptError;
          }
        } else {
          // Non-interactive terminal (CI, scripts, etc.)
          const errorMessage = errorJson?.message || errorJson?.error || 'Authentication failed';
          throw new Error(`Error: Authentication failed. Please run 'neurcode login'.`);
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `API request failed with status ${response.status}`;
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
          if (errorJson.message) {
            errorMessage += `: ${errorJson.message}`;
          }
        } catch {
          errorMessage += `: ${errorText}`;
        }

        throw new Error(errorMessage);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      // Re-throw if it's already our formatted error
      if (error instanceof Error && error.message.startsWith('Error: Authentication failed')) {
        throw error;
      }
      
      // For other errors, wrap them appropriately
      throw error;
    }
  }

  async analyzeDiff(diff: string, projectId?: string): Promise<AnalyzeDiffResponse> {
    const url = `${this.apiUrl}/api/v1/analyze-diff`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    return this.makeRequest<AnalyzeDiffResponse>(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        diff,
        projectId
      })
    });
  }

  async analyzeBloat(diff: string, intent?: string, projectId?: string, sessionId?: string, fileContents?: Record<string, string>): Promise<AnalyzeBloatResponse> {
    const url = `${this.apiUrl}/api/v1/analyze-bloat`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    return this.makeRequest<AnalyzeBloatResponse>(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        diff,
        intent,
        projectId,
        sessionId,
        fileContents
      })
    });
  }

  async getFileVersions(filePath: string, projectId?: string, limit: number = 50): Promise<Array<{
    id: string;
    organizationId: string;
    projectId: string | null;
    filePath: string;
    versionNumber: number;
    fileContent: string;
    diffFromPrevious: string | null;
    sessionId: string | null;
    userId: string | null;
    changeType: 'add' | 'delete' | 'modify' | 'rename' | null;
    linesAdded: number;
    linesRemoved: number;
    createdAt: string;
  }>> {
    const url = `${this.apiUrl}/api/v1/revert/versions`;
    const params = new URLSearchParams({ filePath });
    if (projectId) params.set('projectId', projectId);
    if (limit) params.set('limit', limit.toString());
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const apiKey = this.getApiKey();
    const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = key;

    const fullUrl = `${url}?${params.toString()}`;
    const response = await this.fetchWithDebug(fullUrl, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API request failed with status ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
        if (errorJson.message) {
          errorMessage += `: ${errorJson.message}`;
        }
      } catch {
        errorMessage += `: ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    return response.json() as Promise<Array<{
      id: string;
      organizationId: string;
      projectId: string | null;
      filePath: string;
      versionNumber: number;
      fileContent: string;
      diffFromPrevious: string | null;
      sessionId: string | null;
      userId: string | null;
      changeType: 'add' | 'delete' | 'modify' | 'rename' | null;
      linesAdded: number;
      linesRemoved: number;
      createdAt: string;
    }>>;
  }

  async getFileVersion(filePath: string, version: number, projectId?: string): Promise<{
    version: {
      id: string;
      organizationId: string;
      projectId: string | null;
      filePath: string;
      versionNumber: number;
      fileContent: string;
      diffFromPrevious: string | null;
      sessionId: string | null;
      userId: string | null;
      changeType: 'add' | 'delete' | 'modify' | 'rename' | null;
      linesAdded: number;
      linesRemoved: number;
      createdAt: string;
    };
    fileContent: string;
    lineInfo: {
      totalLines: number;
      changeType: 'add' | 'delete' | 'modify' | 'rename' | null;
      linesAdded: number;
      linesRemoved: number;
    };
  }> {
    const url = `${this.apiUrl}/api/v1/revert/version`;
    const params = new URLSearchParams({ 
      filePath, 
      version: version.toString() 
    });
    if (projectId) params.set('projectId', projectId);
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const apiKey = this.getApiKey();
    const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = key;

    const fullUrl = `${url}?${params.toString()}`;
    const response = await this.fetchWithDebug(fullUrl, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API request failed with status ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
        if (errorJson.message) {
          errorMessage += `: ${errorJson.message}`;
        }
      } catch {
        errorMessage += `: ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    return response.json() as Promise<{
      version: {
        id: string;
        organizationId: string;
        projectId: string | null;
        filePath: string;
        versionNumber: number;
        fileContent: string;
        diffFromPrevious: string | null;
        sessionId: string | null;
        userId: string | null;
        changeType: 'add' | 'delete' | 'modify' | 'rename' | null;
        linesAdded: number;
        linesRemoved: number;
        createdAt: string;
      };
      fileContent: string;
      lineInfo: {
        totalLines: number;
        changeType: 'add' | 'delete' | 'modify' | 'rename' | null;
        linesAdded: number;
        linesRemoved: number;
      };
    }>;
  }

  /**
   * Save a file version (for pre-flight snapshots)
   */
  async saveFileVersion(
    filePath: string,
    fileContent: string,
    projectId?: string,
    reason?: string,
    changeType?: 'add' | 'delete' | 'modify' | 'rename' | null,
    linesAdded?: number,
    linesRemoved?: number
  ): Promise<{
    message: string;
    version: {
      id: string;
      organizationId: string;
      projectId: string | null;
      filePath: string;
      versionNumber: number;
      fileContent: string;
      diffFromPrevious: string | null;
      sessionId: string | null;
      userId: string | null;
      changeType: 'add' | 'delete' | 'modify' | 'rename' | null;
      linesAdded: number;
      linesRemoved: number;
      createdAt: string;
    };
  }> {
    const url = `${this.apiUrl}/api/v1/file-versions/save`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const apiKey = this.getApiKey();
    const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = key;

    const response = await this.fetchWithDebug(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filePath,
        fileContent,
        projectId,
        reason,
        changeType,
        linesAdded,
        linesRemoved,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API request failed with status ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
        if (errorJson.message) {
          errorMessage += `: ${errorJson.message}`;
        }
      } catch {
        errorMessage += `: ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    return response.json() as Promise<{
      message: string;
      version: {
        id: string;
        organizationId: string;
        projectId: string | null;
        filePath: string;
        versionNumber: number;
        fileContent: string;
        diffFromPrevious: string | null;
        sessionId: string | null;
        userId: string | null;
        changeType: 'add' | 'delete' | 'modify' | 'rename' | null;
        linesAdded: number;
        linesRemoved: number;
        createdAt: string;
      };
    }>;
  }

  async revertFile(filePath: string, toVersion: number, projectId?: string, reason?: string): Promise<{
    message: string;
    version: {
      id: string;
      organizationId: string;
      projectId: string | null;
      filePath: string;
      versionNumber: number;
      fileContent: string;
      diffFromPrevious: string | null;
      sessionId: string | null;
      userId: string | null;
      changeType: 'add' | 'delete' | 'modify' | 'rename' | null;
      linesAdded: number;
      linesRemoved: number;
      createdAt: string;
    };
    fileContent: string;
    lineInfo: {
      totalLines: number;
      changeType: 'add' | 'delete' | 'modify' | 'rename' | null;
      linesAdded: number;
      linesRemoved: number;
    };
    revertInstructions: {
      method: 'full_replace';
      filePath: string;
      fromVersion: number;
      toVersion: number;
    };
  }> {
    const url = `${this.apiUrl}/api/v1/revert/file`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const apiKey = this.getApiKey();
    const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = key;

    const response = await this.fetchWithDebug(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filePath,
        toVersion,
        projectId,
        reason,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API request failed with status ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
        if (errorJson.message) {
          errorMessage += `: ${errorJson.message}`;
        }
      } catch {
        errorMessage += `: ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    return response.json() as Promise<{
      message: string;
      version: {
        id: string;
        organizationId: string;
        projectId: string | null;
        filePath: string;
        versionNumber: number;
        fileContent: string;
        diffFromPrevious: string | null;
        sessionId: string | null;
        userId: string | null;
        changeType: 'add' | 'delete' | 'modify' | 'rename' | null;
        linesAdded: number;
        linesRemoved: number;
        createdAt: string;
      };
      fileContent: string;
      lineInfo: {
        totalLines: number;
        changeType: 'add' | 'delete' | 'modify' | 'rename' | null;
        linesAdded: number;
        linesRemoved: number;
      };
      revertInstructions: {
        method: 'full_replace';
        filePath: string;
        fromVersion: number;
        toVersion: number;
      };
    }>;
  }

  async refactor(
    fileContent: string,
    redundantBlocks: Array<{ lines: [number, number]; reason: string; suggestion: string }>,
    options?: { projectType?: string; framework?: string; patterns?: string[] }
  ): Promise<RefactorResponse> {
    const url = `${this.apiUrl}/api/v1/refactor`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const apiKey = this.getApiKey();
    const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = key;

    const response = await this.fetchWithDebug(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fileContent,
        redundantBlocks,
        projectType: options?.projectType,
        framework: options?.framework,
        patterns: options?.patterns,
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API request failed with status ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
        if (errorJson.message) {
          errorMessage += `: ${errorJson.message}`;
        }
      } catch {
        errorMessage += `: ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    return response.json() as Promise<RefactorResponse>;
  }

  async analyzeSecurity(diff: string, projectType?: string): Promise<SecurityAnalysisResponse> {
    const url = `${this.apiUrl}/api/v1/analyze-security`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const apiKey = this.getApiKey();
    const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = key;

    const response = await this.fetchWithDebug(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        diff,
        projectType,
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API request failed with status ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
        if (errorJson.message) {
          errorMessage += `: ${errorJson.message}`;
        }
      } catch {
        errorMessage += `: ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    return response.json() as Promise<SecurityAnalysisResponse>;
  }

  /**
   * Connect or ensure project exists
   * Automatically detects Git URL and creates/links project
   * 
   * Note: organizationId is automatically extracted from the auth token by the backend,
   * so it does not need to be passed in the request body.
   * 
   * Backend Issue: The /api/v1/projects/connect endpoint currently requires a non-empty gitUrl.
   * When creating name-only projects (without Git), this will fail with "gitUrl is required".
   * The backend should be updated to allow empty gitUrl when name is provided.
   */
  async ensureProject(gitUrl?: string, name?: string): Promise<{ id: string; name: string }> {
    const url = `${this.apiUrl}/api/v1/projects/connect`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Get API key (will show helpful error if missing)
    // Note: organizationId is extracted from the auth token by requireAuth middleware on the backend
    const apiKey = this.getApiKey();
    const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = key;

    const response = await this.fetchWithDebug(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        gitUrl: gitUrl || '',
        name,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      let fullErrorDetails: any = null;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
        fullErrorDetails = errorJson;
      } catch {
        errorMessage = errorText || errorMessage;
        fullErrorDetails = errorText;
      }
      
      // Enhanced error logging: Log full API error details for debugging
      console.error('\n🔍 API Error Details:');
      console.error(`   Status: ${response.status}`);
      console.error(`   Error: ${errorMessage}`);
      if (fullErrorDetails && typeof fullErrorDetails === 'object') {
        console.error(`   Full Response:`, JSON.stringify(fullErrorDetails, null, 2));
      } else {
        console.error(`   Full Response: ${fullErrorDetails}`);
      }
      console.error('');
      
      throw new Error(`Failed to connect project: ${errorMessage}`);
    }

    const result = await response.json() as { id: string; name: string; gitUrl: string; message: string };
    return { id: result.id, name: result.name };
  }

  /**
   * Select relevant files from a file tree (Semantic Scout - Pass 1)
   * 
   * @param intent - User's intent/request description
   * @param fileTree - Array of file paths representing the project structure
   * @param projectSummary - Optional project summary (tech stack + architecture)
   * @returns Array of selected file paths (max 15)
   */
  async selectFiles(
    intent: string,
    fileTree: string[],
    projectSummary?: string
  ): Promise<string[]> {
    const url = `${this.apiUrl}/api/v1/plan/select-files`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const response = await this.makeRequest<{ files: string[] }>(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        intent,
        fileTree,
        projectSummary,
      })
    });

    return response.files;
  }

  async generatePlan(
    intent: string,
    files: string[],
    projectId?: string,
    ticketMetadata?: { id: string; title: string; description: string; acceptanceCriteria?: string },
    projectSummary?: string
  ): Promise<GeneratePlanResponse> {
    const url = `${this.apiUrl}/api/v1/plan`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    return this.makeRequest<GeneratePlanResponse>(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        intent,
        files,
        projectId,
        ticketMetadata,
        projectSummary,
      })
    });
  }

  async applyPlan(planId: string, snapshots?: Array<{ path: string; originalContent: string }>): Promise<ApplyPlanResponse> {
    const url = `${this.apiUrl}/api/v1/apply`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // Get API key (will show helpful error if missing)
    const apiKey = this.getApiKey();
    // Support both "Bearer nk_live_..." and just "nk_live_..."
    const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = key;

    const response = await this.fetchWithDebug(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        planId,
        snapshots: snapshots || [],
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API request failed with status ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
        if (errorJson.message) {
          errorMessage += `: ${errorJson.message}`;
        }
      } catch {
        errorMessage += `: ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    return response.json() as Promise<ApplyPlanResponse>;
  }

  /**
   * Get active custom policies for the authenticated user (dashboard-defined rules).
   * Used by verify to enforce e.g. "No console.log" and other custom rules.
   */
  async getActiveCustomPolicies(): Promise<Array<{
    id: string;
    user_id: string;
    rule_text: string;
    severity: 'low' | 'medium' | 'high';
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>> {
    const url = `${this.apiUrl}/api/v1/custom-policies/active`;
    const response = await this.makeRequest<{ policies: Array<{
      id: string;
      user_id: string;
      rule_text: string;
      severity: 'low' | 'medium' | 'high';
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }> }>(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    return response.policies ?? [];
  }

  async verifyPlan(
    planId: string,
    diffStats: {
      totalAdded: number;
      totalRemoved: number;
      totalFiles: number;
    },
    changedFiles: Array<{
      path: string;
      oldPath?: string;
      changeType: 'add' | 'delete' | 'modify' | 'rename';
      added: number;
      removed: number;
      hunks: Array<{
        oldStart: number;
        oldLines: number;
        newStart: number;
        newLines: number;
        lines: Array<{
          type: 'context' | 'added' | 'removed';
          content: string;
          lineNumber?: number;
        }>;
      }>;
    }>,
    projectId?: string,
    intentConstraints?: string
  ): Promise<VerifyPlanResponse> {
    const url = `${this.apiUrl}/api/v1/verify`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const apiKey = this.getApiKey();
    const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = key;

    const response = await this.fetchWithDebug(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        planId,
        diffStats,
        changedFiles,
        projectId,
        intentConstraints, // Pass user constraints (e.g., "No useEffect")
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API request failed with status ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
        if (errorJson.message) {
          errorMessage += `: ${errorJson.message}`;
        }
      } catch {
        errorMessage += `: ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    return response.json() as Promise<VerifyPlanResponse>;
  }

  /**
   * Allow a file to be modified in a session (bypass scope guard)
   */
  async allowFile(sessionId: string, filePath: string): Promise<AISession> {
    const url = `${this.apiUrl}/api/v1/sessions/${sessionId}/allow`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const apiKey = this.getApiKey();
    const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = key;

    const response = await this.fetchWithDebug(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ filePath }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API request failed with status ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
        if (errorJson.message) {
          errorMessage += `: ${errorJson.message}`;
        }
      } catch {
        errorMessage += `: ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    return response.json() as Promise<AISession>;
  }


  /**
   * Get plan by ID
   */
  async getPlan(planId: string): Promise<{
    id: string;
    organizationId: string;
    projectId: string | null;
    userId: string | null;
    sessionId: string | null;
    intent: string;
    content: ArchitectPlan;
    status: 'PENDING' | 'APPLIED' | 'REJECTED' | 'CANCELLED';
    appliedAt: string | null;
    appliedBy: string | null;
    rejectionReason: string | null;
    createdAt: string;
    updatedAt: string;
  }> {
    const url = `${this.apiUrl}/api/v1/plan/${planId}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const apiKey = this.getApiKey();
    const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = key;

    const response = await this.fetchWithDebug(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API request failed with status ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
        if (errorJson.message) {
          errorMessage += `: ${errorJson.message}`;
        }
      } catch {
        errorMessage += `: ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    return response.json() as Promise<{
      id: string;
      organizationId: string;
      projectId: string | null;
      userId: string | null;
      sessionId: string | null;
      intent: string;
      content: ArchitectPlan;
      status: 'PENDING' | 'APPLIED' | 'REJECTED' | 'CANCELLED';
      appliedAt: string | null;
      appliedBy: string | null;
      rejectionReason: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
  }

  /**
   * Get Cursor prompt for a plan
   */
  async getPlanPrompt(planId: string): Promise<{ prompt: string; intent: string }> {
    const url = `${this.apiUrl}/api/v1/architect/plan/${planId}/prompt`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const apiKey = this.getApiKey();
    const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = key;

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API request failed with status ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
        if (errorJson.message) {
          errorMessage += `: ${errorJson.message}`;
        }
      } catch {
        errorMessage += `: ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    return response.json() as Promise<{ prompt: string; intent: string }>;
  }

  /**
   * Get list of projects for the authenticated user
   */
  async getProjects(): Promise<Array<{
    id: string;
    name: string;
    slug: string;
    git_url: string | null;
    git_provider: string | null;
    default_branch: string | null;
    description: string | null;
    created_at: string;
    updated_at: string;
  }>> {
    const url = `${this.apiUrl}/api/v1/projects`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const apiKey = this.getApiKey();
    const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = key;

    const response = await this.fetchWithDebug(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API request failed with status ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
        if (errorJson.message) {
          errorMessage += `: ${errorJson.message}`;
        }
      } catch {
        errorMessage += `: ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    return response.json() as Promise<Array<{
      id: string;
      name: string;
      slug: string;
      git_url: string | null;
      git_provider: string | null;
      default_branch: string | null;
      description: string | null;
      created_at: string;
      updated_at: string;
    }>>;
  }

  /**
   * Get project by name (for CLI auto-discovery)
   */
  async getProjectByName(name: string): Promise<{
    id: string;
    name: string;
    slug: string;
    git_url: string | null;
    git_provider: string | null;
    default_branch: string | null;
    description: string | null;
    created_at: string;
    updated_at: string;
  } | null> {
    const url = `${this.apiUrl}/api/v1/projects/by-name?name=${encodeURIComponent(name)}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const apiKey = this.getApiKey();
    const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = key;

    const response = await this.fetchWithDebug(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API request failed with status ${response.status}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
        if (errorJson.message) {
          errorMessage += `: ${errorJson.message}`;
        }
      } catch {
        errorMessage += `: ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    const result = await response.json();
    return result as {
      id: string;
      name: string;
      slug: string;
      git_url: string | null;
      git_provider: string | null;
      default_branch: string | null;
      description: string | null;
      created_at: string;
      updated_at: string;
    } | null;
  }

  /**
   * Get current user information
   * Works with both API keys and Clerk JWT tokens
   */
  async getCurrentUser(): Promise<{
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    imageUrl?: string;
  }> {
    const url = `${this.apiUrl}/api/v1/users/me`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    return this.makeRequest<{
      id: string;
      email: string;
      firstName?: string;
      lastName?: string;
      imageUrl?: string;
    }>(url, {
      method: 'GET',
      headers,
    }, false); // Don't retry on auth for getCurrentUser (used to check login status)
  }

  /**
   * Get sessions for a project
   */
  async getSessions(projectId?: string, limit: number = 5): Promise<Array<{
    id: string;
    sessionId: string;
    title: string | null;
    intentDescription: string | null;
    status: string;
    createdAt: string;
  }>> {
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    params.set('limit', limit.toString());
    
    const url = `${this.apiUrl}/api/v1/sessions?${params.toString()}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const apiKey = this.getApiKey();
    const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = key;

    const response = await this.fetchWithDebug(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${errorText}`);
    }

    const sessions = await response.json() as Array<{
      id: string;
      sessionId: string;
      title: string | null;
      intentDescription: string | null;
      status: string;
      createdAt: string;
    }>;

    return sessions;
  }

  /**
   * End a session (mark as completed)
   */
  async endSession(sessionId: string): Promise<{ message: string }> {
    const url = `${this.apiUrl}/api/v1/sessions/${sessionId}/end`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const apiKey = this.getApiKey();
    const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = key;

    const response = await this.fetchWithDebug(url, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${errorText}`);
    }

    return await response.json() as { message: string };
  }

  /**
   * Get a specific session by ID
   */
  async getSession(sessionId: string): Promise<{
    session: {
      id: string;
      sessionId: string;
      title: string | null;
      intentDescription: string | null;
      status: string;
      createdAt: string;
      endedAt: string | null;
    };
    files: Array<any>;
  }> {
    const url = `${this.apiUrl}/api/v1/sessions/${sessionId}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    const apiKey = this.getApiKey();
    const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    headers['Authorization'] = key;

    const response = await this.fetchWithDebug(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${errorText}`);
    }

    return await response.json() as {
      session: {
        id: string;
        sessionId: string;
        title: string | null;
        intentDescription: string | null;
        status: string;
        createdAt: string;
        endedAt: string | null;
      };
      files: Array<any>;
    };
  }
}

export interface AISession {
  id: string;
  organizationId: string;
  userId: string | null;
  projectId: string | null;
  sessionId: string;
  intentDescription: string | null;
  aiModel: string | null;
  status: 'active' | 'completed' | 'cancelled';
  startedAt: string;
  endedAt: string | null;
  totalFilesChanged: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  expectedFiles: string[];
  allowedFiles: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ArchitectPlan {
  type: 'neurcode_architect_plan';
  summary: string;
  files: Array<{
    path: string;
    action: 'CREATE' | 'MODIFY' | 'BLOCK';
    reason?: string;
    suggestion?: string;
  }>;
  recommendations?: string[];
  estimatedComplexity?: 'low' | 'medium' | 'high';
}

export interface ApplyPlanResponse {
  success: boolean;
  planId: string;
  filesGenerated: number;
  files: Array<{
    path: string;
    content: string;
  }>;
  message: string;
}

export interface RefactorResponse {
  suggestion: {
    originalCode: string;
    optimizedCode: string;
    changes: Array<{
      type: 'removed' | 'modified' | 'added';
      lines: [number, number];
      original: string;
      optimized: string;
      reason: string;
    }>;
    improvements: Array<{
      category: string;
      description: string;
      impact: 'high' | 'medium' | 'low';
    }>;
    tokenSavings: number;
    costSavings: number;
    riskAssessment: {
      breakingChanges: boolean;
      riskLevel: 'low' | 'medium' | 'high';
      warnings: string[];
    };
  };
  timestamp: string;
}

export interface SecurityAnalysisResponse {
  analysis: {
    issues: Array<{
      severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      type: string;
      description: string;
      file: string;
      lines: [number, number];
      code: string;
      exploitation: string;
      fix: string;
      cwe?: string;
    }>;
    summary: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      total: number;
    };
    recommendation: 'block' | 'warn' | 'allow';
    overallRisk: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  };
  timestamp: string;
}

export interface GeneratePlanResponse {
  plan: {
    type: 'neurcode_architect_plan';
    summary: string;
    files: Array<{
      path: string;
      action: 'CREATE' | 'MODIFY' | 'BLOCK';
      reason?: string;
      suggestion?: string;
    }>;
    recommendations?: string[];
    estimatedComplexity?: 'low' | 'medium' | 'high';
  };
  planId: string;
  sessionId?: string | null; // Session ID string (e.g., "session_1234_...")
  timestamp: string;
}

export interface VerifyPlanResponse {
  verificationId: string;
  adherenceScore: number;
  bloatCount: number;
  bloatFiles: string[];
  plannedFilesModified: number;
  totalPlannedFiles: number;
  verdict: 'PASS' | 'FAIL' | 'WARN';
  diffSummary: {
    added: number;
    removed: number;
    files: Array<{
      path: string;
      changeType: string;
      added: number;
      removed: number;
    }>;
  };
  message: string;
}

