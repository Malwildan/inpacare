export interface RoomStore {
  list(): Promise<unknown[]>;
  detail(roomId: string): Promise<unknown>;
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
