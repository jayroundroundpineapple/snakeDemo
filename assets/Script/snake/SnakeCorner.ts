import { SnakeTypeEnum } from "../GameConf";

const { ccclass, property } = cc._decorator;

@ccclass
export default class SnakeCorner extends cc.Component {
    @property(cc.Sprite)
    private cornerSprite: cc.Sprite = null;
    @property(cc.SpriteFrame)
    private cornerFrameArray: cc.SpriteFrame[] = [];

    /** 更换拐角贴图（与头/身/尾同一套 SnakeTypeEnum） */
    public setSpriteFrame(type: SnakeTypeEnum): void {
        if (this.cornerSprite && this.cornerSprite.node) {
            const frame = this.cornerFrameArray[type - 1];
            if (frame) {
                this.cornerSprite.spriteFrame = frame;
            }
        }
    }
}
