export const APP_CONFIG = {
  GLOBAL_PREFIX: 'kahoot-api',
  DEFAULT_PORT: 3000,
  DEFAULT_QUESTION_TIME_LIMIT: 20, // seconds
  DEFAULT_QUESTION_POINTS: 1000,
} as const;

export const SOCKET_EVENTS = {
  JOIN_ROOM: 'join_room',
  CREATE_SESSION: 'create_session',
  PLAYER_JOINED: 'player_joined',
  START_GAME: 'start_game',
  NEW_QUESTION: 'new_question',
  SUBMIT_ANSWER: 'submit_answer',
  QUESTION_RESULTS: 'question_results',
  GAME_OVER: 'game_over',
} as const;
