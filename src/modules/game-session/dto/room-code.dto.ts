import { IsString, Matches } from 'class-validator';

export class RoomCodeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'El código de sala debe tener 6 dígitos' })
  roomCode: string;
}
