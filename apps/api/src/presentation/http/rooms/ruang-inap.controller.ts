import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { CurrentActor, Roles } from "../security/auth-context";
import { Actor } from "../security/auth-context";
import {
  CreateRoomDto,
  CreateRoomItemDto,
  DeleteRoomItemDto,
  RoomVersionDto,
  UpdateRoomDto,
  UpdateRoomItemDto,
} from "./dto/room.dto";
import { RuangInapUseCases } from "../../../application/rooms/ruang-inap.use-cases";
@Controller("rooms")
export class RuangInapController {
  constructor(private readonly rooms: RuangInapUseCases) {}
  @Get()
  @Roles("DOKTER", "PERAWAT", "ADMISI")
  getDaftarRuangInap() {
    return this.rooms.list();
  }
  @Get(":id")
  @Roles("DOKTER", "PERAWAT", "ADMISI")
  getDetailRuangInap(
    @Param("id")
    id: string,
  ) {
    return this.rooms.detail(id);
  }
  @Post()
  @HttpCode(200)
  @Roles("PERAWAT")
  tambahRuangInap(
    @CurrentActor()
    actor: Actor,
    @Body()
    dto: CreateRoomDto,
  ) {
    return this.rooms.create(actor, dto);
  }
  @Patch(":id")
  @Roles("PERAWAT")
  updateRuangInap(
    @Param("id")
    id: string,
    @Body()
    dto: UpdateRoomDto,
  ) {
    return this.rooms.update(id, dto);
  }
  @Delete(":id")
  @Roles("PERAWAT")
  hapusRuangInap(
    @Param("id")
    id: string,
    @Body()
    dto: RoomVersionDto,
  ) {
    return this.rooms.deleteRoom(id, dto);
  }
  @Post(":id/items")
  @HttpCode(200)
  @Roles("PERAWAT")
  tambahItem(
    @Param("id")
    id: string,
    @Body()
    dto: CreateRoomItemDto,
  ) {
    return this.rooms.addItem(id, dto);
  }
  @Patch(":id/items/:itemId")
  @Roles("PERAWAT")
  updateItem(
    @Param("id")
    id: string,
    @Param("itemId")
    itemId: string,
    @Body()
    dto: UpdateRoomItemDto,
  ) {
    return this.rooms.updateItem(id, itemId, dto);
  }
  @Delete(":id/items/:itemId")
  @Roles("PERAWAT")
  hapusItem(
    @Param("id")
    id: string,
    @Param("itemId")
    itemId: string,
    @Body()
    dto: DeleteRoomItemDto,
  ) {
    return this.rooms.deleteItem(id, itemId, dto);
  }
}
