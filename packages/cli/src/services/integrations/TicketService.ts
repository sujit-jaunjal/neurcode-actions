/**
 * Ticket Service - Contextual Intent Mapping
 * 
 * Fetches business requirements from issue trackers (Linear, Jira) to enrich user intents.
 */

import { ApiClient } from '../../api-client';

export interface TicketMetadata {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria?: string;
  labels?: string[];
  status?: string;
  priority?: string | number;
  url?: string;
}

export interface TicketContext {
  ticket: TicketMetadata;
  enrichedIntent: string; // Intent merged with ticket context
}

/**
 * Ticket Service for fetching issue tracker data
 */
export class TicketService {
  private apiClient: ApiClient;

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
  }

  /**
   * Detect ticket format (Jira: PROJ-123, Linear: ABC-123)
   * 
   * Note: Check Linear first (3-4 letters) before Jira (1+ letters)
   * because Linear pattern is more specific and would be incorrectly
   * classified as Jira if checked second.
   */
  private detectTicketType(ticketId: string): 'jira' | 'linear' | 'unknown' {
    // Linear format: ABC-123, NEU-5 (3-4 letters, dash, numbers)
    // Check this FIRST because it's more specific
    if (/^[A-Z]{3,4}-\d+$/.test(ticketId)) {
      return 'linear';
    }
    
    // Jira format: PROJECT-123 (1+ uppercase letters, dash, numbers)
    // Check this SECOND because it's more general (matches longer project names)
    if (/^[A-Z]+-\d+$/.test(ticketId)) {
      return 'jira';
    }

    return 'unknown';
  }

  /**
   * Fetch ticket from Jira via backend API
   * 
   * @param ticketId - Jira ticket ID (e.g., PROJ-123)
   * @returns Ticket metadata or null if fetch fails
   */
  private async fetchFromJira(ticketId: string): Promise<TicketMetadata | null> {
    // TODO: Implement Jira backend integration (similar to Linear)
    // For now, throw error indicating Jira is not yet supported
    throw new Error('Jira integration is not yet implemented. Only Linear tickets are currently supported.');
  }

  /**
   * Fetch ticket from Linear via backend API
   * 
   * @param ticketId - Linear issue ID (e.g., NEU-123)
   * @returns Ticket metadata or null if fetch fails
   */
  private async fetchFromLinear(ticketId: string): Promise<TicketMetadata | null> {
    try {
      // Call backend API to fetch Linear ticket
      // Backend handles authentication and Linear API calls
      const apiUrl = this.apiClient['apiUrl']; // Access private property
      const url = `${apiUrl}/api/linear/ticket/${encodeURIComponent(ticketId)}`;
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Get API key from client
      const apiKey = this.apiClient['getApiKey']();
      const key = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
      headers['Authorization'] = key;

      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Failed to fetch Linear ticket: ${response.status}`;
        
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.message) {
            errorMessage = errorJson.message;
          }
          // If Linear is not connected, provide helpful error
          if (errorJson.error === 'Linear Not Connected') {
            throw new Error('Linear is not connected. Please run: neurcode login\nThen visit https://neurcode.com/dashboard/integrations to connect Linear.');
          }
        } catch (parseError) {
          // If JSON parse fails, use original error message
          if (parseError instanceof Error && parseError.message.includes('Linear is not connected')) {
            throw parseError; // Re-throw our custom error
          }
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json() as { ticket: TicketMetadata };
      return data.ticket;
    } catch (error) {
      // Re-throw with context
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Error fetching Linear ticket: ${String(error)}`);
    }
  }

  /**
   * Fetch ticket from issue tracker
   * 
   * @param ticketId - Ticket ID (e.g., PROJ-123 for Jira, ABC-123 for Linear)
   * @returns Ticket metadata
   * @throws Error if ticket cannot be fetched or format is unknown
   */
  async fetchTicket(ticketId: string): Promise<TicketMetadata> {
    const ticketType = this.detectTicketType(ticketId);

    if (ticketType === 'unknown') {
      throw new Error(`Unknown ticket format: ${ticketId}. Expected Jira format (PROJ-123) or Linear format (ABC-123)`);
    }

    let ticket: TicketMetadata | null;

    try {
      if (ticketType === 'jira') {
        ticket = await this.fetchFromJira(ticketId);
      } else {
        ticket = await this.fetchFromLinear(ticketId);
      }

      if (!ticket) {
        throw new Error(`Failed to fetch ticket ${ticketId} from ${ticketType}`);
      }

      return ticket;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Error fetching ticket ${ticketId}: ${String(error)}`);
    }
  }

  /**
   * Enrich user intent with ticket context
   * 
   * @param intent - User's original intent
   * @param ticket - Ticket metadata
   * @returns Enriched intent string
   */
  enrichIntent(intent: string, ticket: TicketMetadata): string {
    const parts: string[] = [];

    // Add ticket title
    parts.push(`Ticket: ${ticket.id} - ${ticket.title}`);

    // Add ticket description
    if (ticket.description) {
      parts.push(`\nDescription: ${ticket.description}`);
    }

    // Add acceptance criteria if available
    if (ticket.acceptanceCriteria) {
      parts.push(`\nAcceptance Criteria:\n${ticket.acceptanceCriteria}`);
    }

    // Add user's original intent
    parts.push(`\nUser Intent: ${intent}`);

    return parts.join('\n');
  }

  /**
   * Fetch ticket and enrich intent in one call
   * 
   * @param ticketId - Ticket ID
   * @param intent - User's original intent
   * @returns Ticket context with enriched intent
   */
  async fetchTicketAndEnrich(ticketId: string, intent: string): Promise<TicketContext> {
    const ticket = await this.fetchTicket(ticketId);
    const enrichedIntent = this.enrichIntent(intent, ticket);

    return {
      ticket,
      enrichedIntent,
    };
  }
}

