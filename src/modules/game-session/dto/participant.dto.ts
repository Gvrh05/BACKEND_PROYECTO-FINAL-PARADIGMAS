/** Public projection: never expose sockets or individual answers. */
export class ParticipantDto {
  userId: string;
  name: string;
  connected: boolean;
  avatarId?: number;
  ready?: boolean;
  score?: number;
  isHost?: boolean;
}
