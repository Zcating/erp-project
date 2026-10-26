export const ports = {};

export type MasterDataReference = {
  documentNo: string;
};

export type MasterDataReferenceChecker = {
  findMasterDataReferences(masterDataId: string): Promise<MasterDataReference[]>;
};

export type PostedItemReferenceChecker = {
  findPostedItemReferences(itemId: string): Promise<MasterDataReference[]>;
};
