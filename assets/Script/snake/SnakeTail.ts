import { SnakeTypeEnum } from "../GameConf";

const { ccclass, property } = cc._decorator;
@ccclass
export default class SnakeTail extends cc.Component {
    @property(cc.Sprite)
    private tailSprite: cc.Sprite = null;
    @property(cc.SpriteFrame)
    private tailFrameArray: cc.SpriteFrame[] = [];

    /** 更换蛇尾贴图 */
    public setSpriteFrame(type:SnakeTypeEnum): void {
        if (this.tailSprite.node) {
            this.tailSprite.spriteFrame = this.tailFrameArray[type-1];
        }
    }
}
