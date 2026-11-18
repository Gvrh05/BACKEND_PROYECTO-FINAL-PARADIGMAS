import { isUUID } from 'class-validator';
import { GoalKickError } from '../engine/goal-kick-game';
export type GoalKickAction = 'start' | 'shoot' | 'sync' | 'cancel' | 'return';
export interface GoalKickCommand {
  roomCode: string;
  gameId?: string;
  commandId?: string;
  attemptId?: string;
  aimX?: number;
  curve?: number;
}
/** Separate strict contract: never relax trivia's questionId/answer validator. */
export function parseGoalKickCommand(
  action: GoalKickAction,
  value: unknown,
): GoalKickCommand {
  const fail = () => {
    throw new GoalKickError('INVALID_COMMAND', 'Comando de minijuego inválido');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail();
  const p = value as Record<string, unknown>;
  const fields =
    action === 'shoot'
      ? ['roomCode', 'gameId', 'commandId', 'attemptId', 'aimX', 'curve']
      : action === 'start'
        ? ['roomCode', 'commandId']
        : action === 'sync'
          ? ['roomCode', 'gameId']
          : ['roomCode', 'gameId', 'commandId'];
  if (
    Object.keys(p).some((k) => !fields.includes(k)) ||
    typeof p.roomCode !== 'string' ||
    !/^\d{6}$/.test(p.roomCode)
  )
    return fail();
  for (const key of fields.filter((k) => k.endsWith('Id'))) {
    if (action === 'sync' && p[key] === undefined) continue;
    if (typeof p[key] !== 'string' || !isUUID(p[key])) return fail();
  }
  if (
    action === 'shoot' &&
    (typeof p.aimX !== 'number' ||
      !Number.isFinite(p.aimX) ||
      p.aimX < 200 ||
      p.aimX > 800 ||
      typeof p.curve !== 'number' ||
      !Number.isFinite(p.curve) ||
      Math.abs(p.curve) > 260)
  )
    return fail();
  return p as unknown as GoalKickCommand;
}
