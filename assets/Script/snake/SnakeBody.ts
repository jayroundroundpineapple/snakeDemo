import { SnakeTypeEnum } from "../GameConf";

const { ccclass, property } = cc._decorator;

@ccclass
export default class SnakeBody extends cc.Component {
    @property(cc.Sprite)
    private bodySprite: cc.Sprite = null;
    @property(cc.SpriteFrame)
    private bodyFrameArray: cc.SpriteFrame[] = [];

    /** 更换蛇身贴图 */
    public setSpriteFrame(type: SnakeTypeEnum): void {
        if (this.bodySprite && this.bodySprite.node) {
            const frame = this.bodyFrameArray[type-1];
            if (frame) {
                this.bodySprite.spriteFrame = frame;
            }
        }
    }
}
