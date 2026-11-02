export interface RoomItemRecord {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unitPrice: string;
}
export interface RoomRecord {
  id: string;
  name: string;
  roomClass: string;
  capacity: number;
  status: string;
  picId: string | null;
  picName: string | null;
  dailyRate: string;
  version: number;
  items: RoomItemRecord[];
  occupants: number;
}
export interface RoomStore {
  list(): Promise<RoomRecord[]>;
  detail(roomId: string): Promise<RoomRecord>;
  validatePic(picId?: string | null): Promise<void>;
  create(input: {
    id: string;
    name: string;
    roomClass: string;
    capacity: number;
    status: string;
    picId: string | null;
    dailyRate: string;
  }): Promise<void>;
  lockVersion(roomId: string): Promise<number | undefined>;
  capacityExceeded(roomId: string, capacity: number): Promise<boolean>;
  update(
    roomId: string,
    input: {
      name: string;
      roomClass: string;
      capacity: number;
      status: string;
      picId: string | null;
      dailyRate: string;
    },
  ): Promise<void>;
  addItem(
    roomId: string,
    itemId: string,
    input: {
      name: string;
      category: string;
      quantity: number;
      unitPrice: string;
    },
  ): Promise<boolean>;
  updateItem(
    roomId: string,
    itemId: string,
    input: {
      name: string;
      category: string;
      quantity: number;
      unitPrice: string;
    },
  ): Promise<boolean>;
  deleteItem(roomId: string, itemId: string): Promise<boolean>;
  bumpVersion(roomId: string): Promise<void>;
  hasActiveLinks(roomId: string): Promise<boolean>;
  archive(roomId: string): Promise<void>;
}
