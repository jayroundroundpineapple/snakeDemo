import { SnakeTypeEnum } from "../GameConf";
import RESSpriteFrame from "../RESSpriteFrame";

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

    /** 阻挡反馈：在 headSprite 节点上播放名为 error 的 Animation 剪辑 */
    public playErrorAnimation(): void {
        if (!this.headSprite || !this.headSprite.node) return;
        const anim1 = this.headSprite.node.children[0].getComponent(cc.Animation);
        const anim2 = this.headSprite.node.children[1].getComponent(cc.Animation);
        anim1.node.active = true
        anim2.node.active = true
        this.node.children[2].active = false
        let redIcon = this.node.children[3];
        redIcon.opacity = 0;
        redIcon.active = true;
        cc.audioEngine.play(RESSpriteFrame.instance.errorAudioClip,false,1)
        cc.tween(redIcon)
        .to(0.1, { opacity: 255 })
        .delay(0.1)
        .to(0.2, { opacity: 0 })
        .call(()=>{
            redIcon.active = false;
        })
        .start();
        if (anim1 && anim2) {
            anim1.play("error");
            anim2.play("error");
        }
    }

    /** 阻挡反馈结束后停止 error 动画 */
    public stopErrorAnimation(): void {
        if (!this.headSprite || !this.headSprite.node) return;
        const c1 = this.headSprite.node.children[0];
        const c2 = this.headSprite.node.children[1];
        const anim1 = c1 ? c1.getComponent(cc.Animation) : null;
        const anim2 = c2 ? c2.getComponent(cc.Animation) : null;
        if (anim1) {
            anim1.stop("error");
            anim1.node.active = false
        }
        if (anim2) {
            anim2.stop("error");
            anim2.node.active = false
        }
        this.node.children[2].active = true
    }
}
