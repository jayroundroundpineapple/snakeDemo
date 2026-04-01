import { SnakeTypeEnum } from "../GameConf";

const { ccclass, property } = cc._decorator;

@ccclass
export default class SnakeHead extends cc.Component {
    @property(cc.Sprite)
    private headSprite: cc.Sprite = null;
    @property(cc.SpriteFrame)
    private headFrameArray: cc.SpriteFrame[] = [];

    /** 更换蛇头贴图 */
    public setSpriteFrame(type: SnakeTypeEnum): void {
        if (this.headSprite && this.headSprite.node) {
            const frame = this.headFrameArray[type-1];
            if (frame) {
                this.headSprite.spriteFrame = frame;
            }
        }
    }
}
