import { IsInt, Max, Min } from 'class-validator';
import { MAX_ITEM_QUANTITY } from '../../orders/dto/create-order.dto.js';

export class SetCartItemDto {
  @IsInt()
  @Min(1)
  @Max(MAX_ITEM_QUANTITY)
  quantity: number;
}
