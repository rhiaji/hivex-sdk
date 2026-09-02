import { NftIssuer } from "./nft/NftIssuer";
import { TokenIssuer } from "./token/TokenIssuer";
import type { IssuerContext } from "./IssuerDispatcher";

/** Groups token and NFT operations under one configuration context. */
export class IssuerClient {
  public readonly token: TokenIssuer;
  public readonly nft: NftIssuer;

  constructor(context: IssuerContext) {
    this.token = new TokenIssuer(context);
    this.nft = new NftIssuer(context);
  }
}
