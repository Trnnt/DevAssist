/**
 * Authentication and Session Constants
 * Centralizes all event types, session states, and method names to prevent
 * string duplication and ease future maintenance.
 */

export const AUTH_EVENTS = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  SESSION_VALID: 'session_valid',
  SESSION_OFFLINE: 'session_offline',
  SESSION_REFRESHED: 'session_refreshed',
  SESSION_EXPIRED: 'session_expired'
};

export const SESSION_STATES = {
  VALID: 'VALID',
  EXPIRED: 'EXPIRED',
  OFFLINE: 'OFFLINE'
};

export const AUTH_METHODS = {
  PAT: 'pat',
  OAUTH: 'oauth'
};
