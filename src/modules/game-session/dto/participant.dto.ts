/** Public projection: never expose sockets, answers or scores. */
export class ParticipantDto {
  userId: string;
  name: string;
  connected: boolean;
}
