import { ApiProperty } from "@nestjs/swagger";

export class SlugDto {
  @ApiProperty({ title: "Entity ID", type: Number })
  id: number;

  @ApiProperty({ type: String, description: "Entity slug" })
  slug: string;
}
