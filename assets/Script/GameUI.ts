
import { GameModel } from "./GameModel";
import GameManager from "./GameManager";
import RESSpriteFrame from "./RESSpriteFrame";
import NotifyEffect from "./utils/NotifyEffect";



const { ccclass, property } = cc._decorator;

@ccclass
export default class GameUI extends cc.Component {
    @property(cc.SpriteFrame)
    private snakeSpriteArr:cc.SpriteFrame[] = [];
    @property(cc.Node)
    private finger3:cc.Node = null;
    @property(cc.Node)
    private finger2:cc.Node = null
    @property(cc.Node)
    private finger: cc.Node = null;
    @property(cc.Prefab)
    private mapRoundPre: cc.Prefab = null
    @property(cc.Node)
    private graphicContainer:cc.Node = null
    @property(cc.Prefab)
    private graphicsPre: cc.Prefab = null
    @property(cc.Node)
    private mapNode: cc.Node = null
    @property(cc.Node)
    private bgNode: cc.Node = null
    @property(cc.Node)
    private maxBg: cc.Node = null
    @property(cc.Node)
    private maskNode: cc.Node = null
    @property(cc.Node)
    private resultNode: cc.Node = null

    private bgmAudioFlag: boolean = true
    private canPlayMusic: boolean = false
    private gameModel: GameModel = null
    private gameManager: GameManager = null
    private pathLeftMapLogged: boolean[] = []
    private moveSpeedRatio: number = 1
    private snakeRoots: cc.Node[] = []
    private snakeHeadNodes: cc.Node[] = []
    private snakeTailNodes: cc.Node[] = []
    private snakeBodyNodes: cc.Node[][] = []

    /** 引导步骤：0=等绿(2), 1=等蓝(1), 2=等黄(0) */
    private _guideStep: number = 0;
    /** 每步对应的路径索引 */
    private readonly _guidePathOrder: number[] = [2, 1, 0];
    protected onLoad(): void {
        this.gameModel = new GameModel()
        this.gameModel.mGame = this
        this.gameManager = new GameManager()
    }
    protected start(): void {
        PlayerAdSdk.init();
        this.resize()
        const level = this.gameManager.initPerformancePreset();
        this.moveSpeedRatio = this.gameManager.getMoveSpeedRatio();
        console.log("[PerformanceLevel]", level, "speedRatio=", this.moveSpeedRatio);
        this.gameManager.loadLevelAndCreateMap(1, this.mapNode, this.mapRoundPre)
        this.scheduleOnce(() => {
            this.initSnakeVisuals();
            this.refreshAllSnakeVisuals();
            this.setupTouchInput();
        }, 0.1);
        let that = this;
        /**屏幕旋转尺寸改变 */
        cc.view.setResizeCallback(() => {
            that.resize();
        })
        cc.find('Canvas').on('touchstart', () => {
            this.canPlayMusic = true
            this.bgmAudioFlag && cc.audioEngine.play(RESSpriteFrame.instance.bgmAudioClip, false, 1)
            this.bgmAudioFlag = false
        })
        this.resize()
    }

    /** 注册触摸：只有当前引导步骤对应的路径才响应点击 */
    private setupTouchInput(): void {
        this.graphicContainer.on(cc.Node.EventType.TOUCH_START, (event: cc.Event.EventTouch) => {
            const loc = event.getLocation();
            const pathIdx = this.gameManager.getPathIndexAtPoint(loc.x, loc.y);
            const expected = this._guidePathOrder[this._guideStep];
            if (pathIdx === expected && !this.gameManager.isPathMoving(expected) && !this.gameManager.isPathLeftMap(expected)) {
                [this.finger, this.finger2, this.finger3][this._guideStep].active = false;
                this.gameManager.setPathMoving(pathIdx, true);
            }
        }, this);
    }

    protected update(_dt: number): void {
        const count = this.gameManager.getPathCount();
        for (let i = 0; i < count; i++) {
            if (this.gameManager.isPathMoving(i)) {
                if (this.gameManager.isPathLeftMap(i)) {
                    if (!this.pathLeftMapLogged[i]) {
                        this.pathLeftMapLogged[i] = true;
                        this.onPathLeft(i);
                    }
                } else {
                    this.gameManager.arrowPathMove(1, i);
                }
            }
        }
        this.refreshAllSnakeVisuals();
    }

    private initSnakeVisuals(): void {
        this.clearSnakeVisuals();
        const pathCount = this.gameManager.getPathCount();
        for (let i = 0; i < pathCount; i++) {
            const root = new cc.Node(`SnakePath_${i}`);
            root.parent = this.graphicContainer;
            root.setPosition(0, 0);

            const head = this.createSnakePartNode(`SnakeHead_${i}`, this.snakeSpriteArr[0]);
            const tail = this.createSnakePartNode(`SnakeTail_${i}`, this.snakeSpriteArr[2]);
            head.parent = root;
            tail.parent = root;

            this.snakeRoots[i] = root;
            this.snakeHeadNodes[i] = head;
            this.snakeTailNodes[i] = tail;
            this.snakeBodyNodes[i] = [];
        }
    }

    private clearSnakeVisuals(): void {
        for (let i = 0; i < this.snakeRoots.length; i++) {
            const root = this.snakeRoots[i];
            if (root && root.isValid) {
                root.destroy();
            }
        }
        this.snakeRoots = [];
        this.snakeHeadNodes = [];
        this.snakeTailNodes = [];
        this.snakeBodyNodes = [];
    }

    private createSnakePartNode(name: string, spriteFrame: cc.SpriteFrame): cc.Node {
        const node = new cc.Node(name);
        const sp = node.addComponent(cc.Sprite);
        sp.spriteFrame = spriteFrame || null;
        return node;
    }

    private refreshAllSnakeVisuals(): void {
        const allPaths = this.gameManager.getArrowPaths();
        for (let i = 0; i < allPaths.length; i++) {
            this.refreshSingleSnakeVisual(i, allPaths[i]);
        }
    }

    private refreshSingleSnakeVisual(pathIdx: number, path: { x: number; y: number }[]): void {
        const root = this.snakeRoots[pathIdx];
        const headNode = this.snakeHeadNodes[pathIdx];
        const tailNode = this.snakeTailNodes[pathIdx];
        const bodyNodes = this.snakeBodyNodes[pathIdx] || [];
        if (!root || !headNode || !tailNode) return;

        if (!path || path.length === 0 || this.gameManager.isPathLeftMap(pathIdx)) {
            root.active = false;
            return;
        }
        root.active = true;
        const mapGap = Math.max(20, this.gameManager.getMapRoundGap());
        const headSize = mapGap * 0.6;
        const tailSize = mapGap * 0.38;
        const bodyWidth = mapGap * 0.52;
        const bodyLength = mapGap * 0.56;

        headNode.active = true;
        headNode.setPosition(path[0].x, path[0].y);
        headNode.zIndex = 30;
        this.fitNodeSizeBySprite(headNode, headSize, headSize);
        if (path.length >= 2) {
            headNode.angle = this.getNodeAngle(path[1], path[0]);
        }

        if (path.length >= 2) {
            const tailIdx = path.length - 1;
            tailNode.active = true;
            tailNode.setPosition(path[tailIdx].x, path[tailIdx].y);
            tailNode.zIndex = 5;
            this.fitNodeSizeBySprite(tailNode, tailSize, tailSize);
            tailNode.angle = this.getNodeAngle(path[tailIdx], path[tailIdx - 1]);
        } else {
            tailNode.active = false;
        }

        // 身体按每段线段“均匀铺设”，保证 mapRound 点与点之间尽量连续连接
        const bodyPlacements: Array<{ x: number; y: number; angle: number }> = [];
        const spacing = Math.max(6, bodyLength * 0.78);
        for (let i = 0; i < path.length - 1; i++) {
            const from = path[i + 1];
            const to = path[i];
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const segLen = Math.sqrt(dx * dx + dy * dy);
            if (segLen < 0.01) continue;

            const segAngle = this.getBodyAngle(from, to);
            const countOnSeg = Math.max(1, Math.floor(segLen / spacing));
            const step = segLen / countOnSeg;
            const ux = dx / segLen;
            const uy = dy / segLen;
            for (let k = 0; k < countOnSeg; k++) {
                const dist = (k + 0.5) * step;
                bodyPlacements.push({
                    x: from.x + ux * dist,
                    y: from.y + uy * dist,
                    angle: segAngle,
                });
            }
        }

        const bodyCountNeeded = bodyPlacements.length;
        while (bodyNodes.length < bodyCountNeeded) {
            const body = this.createSnakePartNode(`SnakeBody_${pathIdx}_${bodyNodes.length}`, this.snakeSpriteArr[1]);
            body.parent = root;
            bodyNodes.push(body);
        }
        while (bodyNodes.length > bodyCountNeeded) {
            const body = bodyNodes.pop();
            if (body && body.isValid) {
                body.destroy();
            }
        }
        this.snakeBodyNodes[pathIdx] = bodyNodes;

        for (let i = 0; i < bodyNodes.length; i++) {
            const bodyNode = bodyNodes[i];
            const placement = bodyPlacements[i];
            bodyNode.active = true;
            bodyNode.setPosition(placement.x, placement.y);
            bodyNode.zIndex = 10;
            bodyNode.angle = placement.angle;
            this.fitNodeSizeBySprite(bodyNode, bodyWidth, bodyLength);
        }
    }

    private fitNodeSizeBySprite(node: cc.Node, targetW: number, targetH: number): void {
        const sp = node.getComponent(cc.Sprite);
        const sf = sp && sp.spriteFrame ? sp.spriteFrame : null;
        if (!sf) {
            node.setContentSize(targetW, targetH);
            return;
        }
        const rect = sf.getRect();
        const srcW = Math.max(1, rect.width);
        const srcH = Math.max(1, rect.height);
        const srcRatio = srcW / srcH;
        const targetRatio = targetW / Math.max(1, targetH);
        if (srcRatio > targetRatio) {
            node.width = targetW;
            node.height = targetW / srcRatio;
        } else {
            node.height = targetH;
            node.width = targetH * srcRatio;
        }
    }

    private getNodeAngle(from: { x: number; y: number }, to: { x: number; y: number }): number {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const rad = Math.atan2(dy, dx);
        let angle = 90 - (rad * 180 / Math.PI);
        if (Math.abs(dy) > Math.abs(dx)) {
            angle += 180;
        }
        return angle;
    }

    /** 身体素材按“横向朝右”为默认朝向时使用 */
    private getBodyAngle(from: { x: number; y: number }, to: { x: number; y: number }): number {
        const rad = Math.atan2(to.y - from.y, to.x - from.x);
        return -(rad * 180 / Math.PI);
    }

    private onPathLeft(pathIdx: number): void {
        if (pathIdx === 2 && this._guideStep === 0) {
            // 绿色离开 → 显示finger2，等待点击蓝色
            this._guideStep = 1;
            this.finger2.active = true;
        } else if (pathIdx === 1 && this._guideStep === 1) {
            // 蓝色离开 → 显示finger3，等待点击黄色
            this._guideStep = 2;
            this.finger3.active = true;
        } else if (pathIdx === 0 && this._guideStep === 2) {
            // 黄色离开 → 结束
            this.showResult();
        }
    }
    showResult(){
        this.maskNode.active = true
        NotifyEffect.NormalShowUI(this.resultNode,RESSpriteFrame.instance.comeOutAudioClip,0.2,true,()=>{
            cc.audioEngine.play(RESSpriteFrame.instance.cherrUpAudioClip,false,1)
        })
    }
    private getRandomInt(min: number, max: number) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    private resize() {
        const canvasValue: any = cc.Canvas.instance;
        let frameSize = cc.view.getFrameSize();
        let isVerTical = cc.winSize.height > cc.winSize.width
        if (isVerTical) {//竖屏
            if (cc.winSize.width / cc.winSize.height > 0.7) {
                cc.Canvas.instance.fitHeight = true;
                cc.Canvas.instance.fitWidth = false;
            } else {
                cc.Canvas.instance.fitHeight = false;
                cc.Canvas.instance.fitWidth = true;
            }
        } else {
            cc.Canvas.instance.fitHeight = true;
            cc.Canvas.instance.fitWidth = false;
        }
        cc.director.getScene().getComponentsInChildren(cc.Widget).forEach(function (t) {
            t.updateAlignment()
        });
        this.maxBg.active = !isVerTical
        this.bgNode.getComponent(cc.Widget).right = isVerTical ? 0 : cc.winSize.width / 6
    }
    private cashoutFunc() {
        console.log('跳转');
        this.canPlayMusic && cc.audioEngine.play(RESSpriteFrame.instance.clickAudioClip, false, 1)
        PlayerAdSdk.gameEnd()
        PlayerAdSdk.jumpStore()
    }
    protected onDisable(): void {

    }
}   
