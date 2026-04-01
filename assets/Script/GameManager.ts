// GameManager.ts
import { LevelConfig, IPathPoint, IPathRowCol, IDirection, LevelsJson } from "./LevelConfig";
const { ccclass, property } = cc._decorator;
@ccclass('GameManager')
export default class GameManager extends cc.Component {
    public static readonly PerformanceLevel = {
        HIGH: 0,
        MID: 1,
        LOW: 2,
    } as const;

    // 单例实例
    private static _instance: GameManager;
    public static getInstance(): GameManager {
        if (!this._instance) {
            this._instance = new GameManager();
            this._instance.init();
        }
        return this._instance;
    }

    // 地图相关
    private _mapNode: cc.Node = null;
    private _mapRoundPre: cc.Prefab = null;
    private _mapRoundItems: cc.Node[] = []; // 地图圆点节点数组
    private _mapRoundPositions: Map<string, IPathPoint> = new Map(); // 圆点位置映射 key: "row_col"
    private _mapRoundGap: number = 0; // 圆点间距

    // 绘制相关
    private _graphicContainer: cc.Node = null;
    private _graphicsPre: cc.Prefab = null;

    // 路径相关
    private _currentLevel: number = 1;
    private _currentLevelConfig: LevelConfig = null;
    private _pathRowColMap: Map<number, IPathRowCol[]> = new Map(); // 路径行列索引映射 key: 路径ID
    private _pathHeads: Map<number, IPathRowCol> = new Map(); // 路径头部位置 key: 路径ID
    private _arrowPaths: IPathPoint[][] = []; // 所有路径的坐标数组
    private _arrowPathsByRowCol: IPathRowCol[][] = []; // 所有路径的行列索引数组
    /** 与 _arrowPaths 下标一一对应：关卡里的路径 ID（如 levels.json 中的 1、2、3） */
    private _pathIdsByIndex: number[] = [];
    private _pathMovingMap: Map<number, boolean> = new Map(); // 路径移动状态
    private _pathLeftMap: Map<number, boolean> = new Map(); // 路径是否离开地图

    /** 路径索引与颜色：0 黄、1 蓝、2 绿（与 _pathColors 一致） */
    private readonly PATH_IDX_YELLOW = 0;
    private readonly PATH_IDX_BLUE = 1;
    private readonly PATH_IDX_GREEN = 2;

    /** 是否已点击过绿色路径（解锁黄/蓝正常移动） */
    private _greenPathUnlocked: boolean = false;

    /** 阻挡反馈：黄/蓝未解锁时点击，箭头变红并撞到绿色再回弹 */
    private _blockedFeedback: {
        pathIdx: number;
        phase: "toHit" | "hold" | "back";
        elapsed: number;
        duration: number;
        holdDuration: number;
        sx: number;
        sy: number;
        hx: number;
        hy: number;
        origX: number;
        origY: number;
    } | null = null;

    private readonly _blockedRedColor: cc.Color = new cc.Color(255, 55, 55, 255);

    /** 绘制时临时覆盖颜色（阻挡反馈用） */
    private _pathColorOverride: Map<number, cc.Color> = new Map();

    /** 黄/蓝撞到绿色阻挡点瞬间回调（用于蛇头 error 动画等） */
    private _onBlockedFeedbackHit: ((pathIdx: number) => void) | null = null;
    /** 黄/蓝阻挡反馈结束（回到原位）回调 */
    private _onBlockedFeedbackEnd: ((pathIdx: number) => void) | null = null;
    private _performanceLevel: number = GameManager.PerformanceLevel.HIGH;
    private _moveSpeedRatio: number = 1;
    private _pathLineWidth: number = 15;

    /**
     * 根据运行环境初始化性能档位，并同步移动速度倍率
     * 返回值用于外部日志或调试展示
     */
    public initPerformancePreset(): number {
        // 默认高性能配置
        let level: number = GameManager.PerformanceLevel.HIGH;
        let ratio = 1;

        // Web 平台的设备信息相对完整，按硬件并发数做粗分档
        const nav = typeof window !== "undefined" ? (window.navigator as Navigator | undefined) : undefined;
        const cores = nav && typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : 0;

        if (cores > 0) {
            if (cores <= 2) {
                level = GameManager.PerformanceLevel.LOW;
                ratio = 0.75;
            } else if (cores <= 4) {
                level = GameManager.PerformanceLevel.MID;
                ratio = 0.9;
            }
        }

        this._performanceLevel = level;
        this._moveSpeedRatio = ratio;
        return this._performanceLevel;
    }

    /** 获取当前移动速度倍率 */
    public getMoveSpeedRatio(): number {
        return this._moveSpeedRatio;
    }

    /**
     * 初始化
     */
    private init(): void {
        // 重置所有状态
        this._mapNode = null;
        this._mapRoundPre = null;
        this._mapRoundItems = [];
        this._mapRoundPositions.clear();
        this._mapRoundGap = 0;

        this._currentLevel = 1;
        this._currentLevelConfig = null;
        this._pathRowColMap.clear();
        this._pathHeads.clear();
        this._arrowPaths = [];
        this._arrowPathsByRowCol = [];
        this._pathIdsByIndex = [];
        this._pathMovingMap.clear();
        this._pathLeftMap.clear();

        this._greenPathUnlocked = false;
        this._blockedFeedback = null;
        this._pathColorOverride.clear();
    }

    /**
     * @param level 关卡数
     * @param mapNode 地图父节点
     * @param mapRoundPre 圆点预制体
     */
    public loadLevelAndCreateMap(level: number, mapNode: cc.Node, mapRoundPre: cc.Prefab): void {
        this._mapNode = mapNode;
        this._mapRoundPre = mapRoundPre;
        this._currentLevel = level;

        const resPath = "levels";
        cc.loader.loadRes(resPath, cc.JsonAsset, (err: Error, jsonAsset: any) => {
            if (err) {
                console.error("加载 levels.json 失败:", err);
                return;
            }

            const levelsJson = jsonAsset.json as LevelsJson;
            const levelConfig = levelsJson.levels.find((item) => item.level === level);
            if (!levelConfig) {
                console.warn(`未找到关卡配置: level=${level}`);
                return;
            }

            this._currentLevelConfig = levelConfig;
            this.createMapRounds(levelConfig.arrowPaths);
            this.initArrowPaths(levelConfig.arrowPaths);
            this._greenPathUnlocked = false;
            this._blockedFeedback = null;
            this._pathColorOverride.clear();
        });
    }

    /**
     * 创建地图圆点 (适配2.x坐标系统)
     * @param arrowPaths 路径配置数组
     */
    private createMapRounds(arrowPaths: number[][]): void {
        if (!this._mapNode || !this._mapRoundPre) {
            console.warn("mapNode 或 mapRoundPre 未绑定");
            return;
        }

        // 清空原有节点
        this._mapNode.removeAllChildren();
        this._mapRoundItems = [];
        this._mapRoundPositions.clear();

        const rowCount = arrowPaths.length;
        const colCount = rowCount > 0 ? arrowPaths[0].length : 0;
        if (rowCount === 0 || colCount === 0) {
            return;
        }

        // 2.x 获取节点尺寸 (直接使用width/height)
        const mapWidth = this._mapNode.width;
        const mapHeight = this._mapNode.height;

        // 计算圆点间距
        this._mapRoundGap = colCount > 1 ? mapWidth / (colCount - 1) : mapHeight / (rowCount - 1);
        const stepX = this._mapRoundGap;
        const stepY = this._mapRoundGap;

        // 2.x 坐标系统：居中计算
        const startX = -mapWidth / 2;
        const startY = mapHeight / 2;

        // 创建圆点
        for (let row = 0; row < rowCount; row++) {
            for (let col = 0; col < colCount; col++) {
                const roundNode = cc.instantiate(this._mapRoundPre);
                roundNode.parent = this._mapNode;
                roundNode.setPosition(startX + col * stepX, startY - row * stepY);
                roundNode.name = `mapRound_${row}_${col}`;
                
                // 2.x 坐标转换：世界坐标转本地坐标
                const worldPos = roundNode.convertToWorldSpaceAR(new cc.Vec2(0, 0));
                const localPos = this._mapNode.convertToNodeSpaceAR(worldPos);
                
                // 记录圆点位置
                this._mapRoundPositions.set(`${row}_${col}`, {
                    x: localPos.x,
                    y: localPos.y
                });

                this._mapRoundItems.push(roundNode);

                // 根据配置设置圆点激活状态
                const pathValue = arrowPaths[row][col];
                roundNode.active = pathValue !== 0;
            }
        }
    }

    /**
     * 初始化箭头路径数据
     * @param arrowPathsConfig 路径配置数组
     */
    private initArrowPaths(arrowPathsConfig: number[][]): void {
        // 清空原有路径数据
        this._pathRowColMap.clear();
        this._pathHeads.clear();
        this._arrowPaths = [];
        this._arrowPathsByRowCol = [];
        this._pathIdsByIndex = [];
        this._pathMovingMap.clear();
        this._pathLeftMap.clear();

        const rowCount = arrowPathsConfig.length;
        const colCount = rowCount > 0 ? arrowPathsConfig[0].length : 0;

        // 第一步：收集所有路径ID和头部位置
        const pathIds = new Set<number>();
        for (let row = 0; row < rowCount; row++) {
            for (let col = 0; col < colCount; col++) {
                const value = arrowPathsConfig[row][col];
                if (value === 0) continue;

                const absValue = Math.abs(value);
                pathIds.add(absValue);

                // 负数代表路径头部
                if (value < 0) {
                    this._pathHeads.set(absValue, { row, col });
                }
            }
        }

        // 第二步：为每个路径构建行列索引路径
        const pathIdList = Array.from(pathIds);
        for (const pathId of pathIdList) {
            const pathPoints: IPathRowCol[] = [];
            const headPos = this._pathHeads.get(pathId);

            // 如果没有头部，跳过
            if (!headPos) continue;

            // 从头部开始遍历，收集同ID的连续点
            let currentRow = headPos.row;
            let currentCol = headPos.col;
            let direction: IDirection = { x: 0, y: 0 };

            // 先添加头部
            pathPoints.push({ row: currentRow, col: currentCol });

            // 查找初始方向（上下左右）
            const checkDirections: IDirection[] = [
                { x: 0, y: 1 },   // 上
                { x: 0, y: -1 },  // 下
                { x: 1, y: 0 },   // 右
                { x: -1, y: 0 }   // 左
            ];

            // 找到第一个有效方向
            for (const dir of checkDirections) {
                const newRow = currentRow + dir.y;
                const newCol = currentCol + dir.x;
                if (newRow >= 0 && newRow < rowCount && newCol >= 0 && newCol < colCount) {
                    if (arrowPathsConfig[newRow][newCol] === pathId) {
                        direction = dir;
                        break;
                    }
                }
            }

            // 沿着方向收集路径点
            while (true) {
                currentRow += direction.y;
                currentCol += direction.x;

                // 边界检查
                if (currentRow < 0 || currentRow >= rowCount || currentCol < 0 || currentCol >= colCount) {
                    break;
                }

                // 检查是否是当前路径的点
                const value = arrowPathsConfig[currentRow][currentCol];
                if (value !== pathId) {
                    break;
                }

                pathPoints.push({ row: currentRow, col: currentCol });

                // 检查是否需要转弯（贪吃蛇逻辑）
                let hasTurn = false;
                for (const dir of checkDirections) {
                    // 跳过反方向
                    if (dir.x === -direction.x && dir.y === -direction.y) continue;
                    
                    const newRow = currentRow + dir.y;
                    const newCol = currentCol + dir.x;
                    if (newRow >= 0 && newRow < rowCount && newCol >= 0 && newCol < colCount) {
                        if (arrowPathsConfig[newRow][newCol] === pathId) {
                            // 检查下一个点是否已存在（避免回退）
                            const isExisted = pathPoints.some(p => p.row === newRow && p.col === newCol);
                            if (!isExisted) {
                                direction = dir;
                                hasTurn = true;
                                break;
                            }
                        }
                    }
                }

                if (!hasTurn) {
                    // 没有转弯，继续直走
                    const nextRow = currentRow + direction.y;
                    const nextCol = currentCol + direction.x;
                    if (nextRow < 0 || nextRow >= rowCount || nextCol < 0 || nextCol >= colCount) {
                        break;
                    }
                    const nextValue = arrowPathsConfig[nextRow][nextCol];
                    if (nextValue !== pathId) {
                        break;
                    }
                }
            }

            // 保存路径
            this._pathRowColMap.set(pathId, pathPoints);
        }

        // 第三步：转换为坐标路径并初始化数组
        this.buildArrowPathsArray();
    }

    /**
     * 构建箭头路径坐标数组
     */
    private buildArrowPathsArray(): void {
        this._arrowPaths = [];
        this._arrowPathsByRowCol = [];
        this._pathIdsByIndex = [];

        // 按路径ID排序
        const sortedPathIds = Array.from(this._pathRowColMap.keys()).sort((a, b) => a - b);

        for (const pathId of sortedPathIds) {
            const rowColPath = this._pathRowColMap.get(pathId);
            if (!rowColPath || rowColPath.length === 0) continue;

            // 转换为坐标路径
            const coordPath = this.convertPathToCoordinates(rowColPath);
            this._arrowPaths.push(coordPath);
            this._arrowPathsByRowCol.push([...rowColPath]);
            this._pathIdsByIndex.push(pathId);

            // 初始化路径状态
            this._pathMovingMap.set(this._arrowPaths.length - 1, false);
            this._pathLeftMap.set(this._arrowPaths.length - 1, false);
        }
    }

    /**
     * 路径在数组中的下标对应的关卡路径 ID（与 levels.json 中格子数值绝对值一致，如 1/2/3）
     */
    public getPathIdByIndex(pathIdx: number): number {
        if (pathIdx < 0 || pathIdx >= this._pathIdsByIndex.length) {
            return 1;
        }
        return this._pathIdsByIndex[pathIdx];
    }

    /**
     * 转换行列路径为坐标路径 (2.x TS 版本)
     * @param path 行列路径
     * @returns 坐标路径
     */
    private convertPathToCoordinates(path: IPathRowCol[]): IPathPoint[] {
        const coordinatePath: IPathPoint[] = [];
        for (const point of path) {
            const pos = this.getRoundItemPosition(point.row, point.col);
            if (pos) {
                coordinatePath.push(pos);
            }
        }
        return coordinatePath;
    }

    /**
     * 获取圆点位置 (2.x TS 版本)
     * @param row 行
     * @param col 列
     * @returns 坐标点
     */
    public getRoundItemPosition(row: number, col: number): IPathPoint | null {
        const key = `${row}_${col}`;
        const position = this._mapRoundPositions.get(key);
        return position ? { ...position } : null;
    }

    /**
     * 获取所有路径的坐标数组
     * @returns 坐标路径数组
     */
    public getArrowPaths(): IPathPoint[][] {
        return this._arrowPaths.map(path => path.map(p => ({ ...p })));
    }

    /**
     * 获取所有路径的行列索引数组
     * @returns 行列路径数组
     */
    public getArrowPathsByRowCol(): IPathRowCol[][] {
        return this._arrowPathsByRowCol.map(path => path.map(p => ({ ...p })));
    }

    /**
     * 获取路径方向 (2.x TS 版本)
     * @param startX 起点X
     * @param startY 起点Y
     * @param endX 终点X
     * @param endY 终点Y
     * @returns 方向向量
     */
    public getDir(startX: number, startY: number, endX: number, endY: number): IDirection {
        const dx = endX - startX;
        const dy = endY - startY;
        const len = Math.sqrt(dx * dx + dy * dy);
        
        if (len < 0.1) {
            return { x: 0, y: 0 };
        }
        
        return {
            x: dx / len,
            y: dy / len
        };
    }

    /**
     * 设置路径移动状态
     * @param pathIdx 路径索引
     * @param isMoving 是否移动
     */
    public setPathMoving(pathIdx: number, isMoving: boolean = true): void {
        this._pathMovingMap.set(pathIdx, isMoving);
    }

    /**
     * 检查路径是否在移动
     * @param pathIdx 路径索引
     * @returns 是否移动
     */
    public isPathMoving(pathIdx: number): boolean {
        return this._pathMovingMap.get(pathIdx) || false;
    }

    /**
     * 检查路径是否离开地图
     * @param pathIdx 路径索引
     * @returns 是否离开
     */
    public isPathLeftMap(pathIdx: number): boolean {
        return this._pathLeftMap.get(pathIdx) || false;
    }

    /**
     * 清除路径移动状态
     * @param pathIdx 路径索引
     */
    public clearPathMoving(pathIdx: number): void {
        this._pathMovingMap.set(pathIdx, false);
    }

    /**
     * 清除所有路径移动状态
     */
    public clearAllPathMoving(): void {
        this._pathMovingMap.forEach((_, key) => {
            this._pathMovingMap.set(key, false);
        });
    }

    /** 绿色路径是否已点击过（解锁黄/蓝） */
    public isGreenPathUnlocked(): boolean {
        return this._greenPathUnlocked;
    }

    /** 标记已点击绿色路径 */
    public markGreenPathClicked(): void {
        this._greenPathUnlocked = true;
    }

    /** 是否为黄/蓝路径（需先点绿） */
    public isYellowOrBluePath(pathIdx: number): boolean {
        return pathIdx === this.PATH_IDX_YELLOW || pathIdx === this.PATH_IDX_BLUE;
    }

    /** 是否为绿色路径 */
    public isGreenPathIndex(pathIdx: number): boolean {
        return pathIdx === this.PATH_IDX_GREEN;
    }

    /** 是否正在播放黄/蓝阻挡反馈动画 */
    public isBlockedFeedbackPlaying(): boolean {
        return this._blockedFeedback !== null;
    }

    public setOnBlockedFeedbackHit(cb: ((pathIdx: number) => void) | null): void {
        this._onBlockedFeedbackHit = cb;
    }

    public setOnBlockedFeedbackEnd(cb: ((pathIdx: number) => void) | null): void {
        this._onBlockedFeedbackEnd = cb;
    }

    /**
     * 当前点击规则下是否被挡住：黄/蓝在未点过绿蛇前，会被绿蛇路径挡住
     */
    public isPathBlockedByGreenRule(pathIdx: number): boolean {
        if (this._pathLeftMap.get(pathIdx)) return false;
        return this.isYellowOrBluePath(pathIdx) && !this._greenPathUnlocked;
    }

    /**
     * 黄/蓝在未点绿时点击：箭头变红，头部沿前进方向撞到绿色路径后再回到原位
     */
    public playBlockedFeedback(pathIdx: number): void {
        if (this._greenPathUnlocked) return;
        if (!this.isYellowOrBluePath(pathIdx)) return;
        if (this._blockedFeedback !== null) return;
        if (pathIdx < 0 || pathIdx >= this._arrowPaths.length) return;
        if (this._pathLeftMap.get(pathIdx)) return;

        const path = this._arrowPaths[pathIdx];
        if (!path || path.length < 2) return;

        const hit = this.findRayHitOnGreenPath(pathIdx);
        if (!hit) return;
        const headDir = this.getDir(path[1].x, path[1].y, path[0].x, path[0].y);
        // 停留点沿前进方向前推一点，避免视觉上“压重叠”
        const hitForwardOffset = this._mapRoundGap * 0.6;
        const holdX = hit.x - headDir.x * hitForwardOffset;
        const holdY = hit.y + headDir.y * hitForwardOffset;

        const origX = path[0].x;
        const origY = path[0].y;

        this._pathColorOverride.set(pathIdx, this._blockedRedColor);
        this._blockedFeedback = {
            pathIdx,
            phase: "toHit",
            elapsed: 0,
            duration: 0.22,
            holdDuration: 0.5,
            sx: origX,
            sy: origY,
            hx: holdX,
            hy: holdY,
            origX,
            origY,
        };
    }

    /** 每帧更新阻挡反馈动画（由 GameUI.update 调用） */
    public tickBlockedFeedback(dt: number): void {
        if (!this._blockedFeedback) return;

        const f = this._blockedFeedback;
        const path = this._arrowPaths[f.pathIdx];
        if (!path || path.length < 2) {
            this.finishBlockedFeedback();
            return;
        }

        f.elapsed += dt;
        const p = Math.min(1, f.elapsed / f.duration);
        const ease = (t: number) => t * t * (3 - 2 * t);
        const e = ease(p);

        if (f.phase === "toHit") {
            path[0].x = f.sx + (f.hx - f.sx) * e;
            path[0].y = f.sy + (f.hy - f.sy) * e;
            this.refreshPathGraphicsWithColor(f.pathIdx, this._blockedRedColor);
            if (p >= 1) {
                const hitCb = this._onBlockedFeedbackHit;
                if (hitCb) {
                    hitCb(f.pathIdx);
                }
                f.phase = "hold";
                f.elapsed = 0;
            }
        } else if (f.phase === "hold") {
            // 碰撞点停留：固定在命中位置保持一段时间，再回退
            path[0].x = f.hx;
            path[0].y = f.hy;
            this.refreshPathGraphicsWithColor(f.pathIdx, this._blockedRedColor);
            if (f.elapsed >= f.holdDuration) {
                f.phase = "back";
                f.elapsed = 0;
            }
        } else {
            path[0].x = f.hx + (f.origX - f.hx) * e;
            path[0].y = f.hy + (f.origY - f.hy) * e;
            this.refreshPathGraphicsWithColor(f.pathIdx, this._blockedRedColor);
            if (p >= 1) {
                path[0].x = f.origX;
                path[0].y = f.origY;
                this.finishBlockedFeedback();
            }
        }
    }

    private finishBlockedFeedback(): void {
        if (this._blockedFeedback) {
            const idx = this._blockedFeedback.pathIdx;
            this._pathColorOverride.delete(idx);
            this.refreshPathGraphics(idx);
            const endCb = this._onBlockedFeedbackEnd;
            if (endCb) {
                endCb(idx);
            }
        }
        this._blockedFeedback = null;
    }

    private cross2(ax: number, ay: number, bx: number, by: number): number {
        return ax * by - ay * bx;
    }

    /**
     * 射线 O + t*D (t>=0) 与线段 AB 的最近交点参数 t；无交点返回 null
     */
    private rayIntersectSegment(
        ox: number,
        oy: number,
        dx: number,
        dy: number,
        ax: number,
        ay: number,
        bx: number,
        by: number
    ): number | null {
        const vx = bx - ax;
        const vy = by - ay;
        const denom = this.cross2(dx, dy, vx, vy);
        if (Math.abs(denom) < 1e-9) return null;
        const apx = ax - ox;
        const apy = ay - oy;
        const t = this.cross2(apx, apy, vx, vy) / denom;
        const u = this.cross2(apx, apy, dx, dy) / denom;
        if (t >= 0 && u >= 0 && u <= 1) return t;
        return null;
    }

    /** 从黄/蓝路径头部沿前进方向发射射线，与绿色路径折线求第一个交点 */
    private findRayHitOnGreenPath(fromPathIdx: number): IPathPoint | null {
        const greenIdx = this.PATH_IDX_GREEN;
        if (greenIdx >= this._arrowPaths.length) return null;

        const fp = this._arrowPaths[fromPathIdx];
        const gp = this._arrowPaths[greenIdx];
        if (!fp || fp.length < 2 || !gp || gp.length < 2) return null;

        const hx = fp[0].x;
        const hy = fp[0].y;
        const dir = this.getDir(fp[1].x, fp[1].y, fp[0].x, fp[0].y);
        if (Math.abs(dir.x) < 1e-6 && Math.abs(dir.y) < 1e-6) return null;

        let bestT = Infinity;
        let hitX = hx;
        let hitY = hy;

        for (let i = 0; i < gp.length - 1; i++) {
            const ax = gp[i].x;
            const ay = gp[i].y;
            const bx = gp[i + 1].x;
            const by = gp[i + 1].y;
            const t = this.rayIntersectSegment(hx, hy, dir.x, dir.y, ax, ay, bx, by);
            if (t !== null && t > 1e-4 && t < bestT) {
                bestT = t;
                hitX = hx + dir.x * t;
                hitY = hy + dir.y * t;
            }
        }

        if (bestT < Infinity) {
            return { x: hitX, y: hitY };
        }

        // 无精确交点时：沿射线取与绿色路径各顶点的最近前向投影点作为“碰撞”示意
        let bestDot = -1;
        let fallback: IPathPoint | null = null;
        for (let i = 0; i < gp.length; i++) {
            const px = gp[i].x - hx;
            const py = gp[i].y - hy;
            const dot = px * dir.x + py * dir.y;
            if (dot > bestDot) {
                bestDot = dot;
                const projT = dot;
                fallback = { x: hx + dir.x * projT, y: hy + dir.y * projT };
            }
        }
        if (fallback && bestDot > this._mapRoundGap * 0.2) {
            return fallback;
        }
        return { x: hx + dir.x * this._mapRoundGap * 2, y: hy + dir.y * this._mapRoundGap * 2 };
    }

    private refreshPathGraphicsWithColor(pathIndex: number, color: cc.Color): void {
        if (!this._graphicContainer) return;
        const graphicsNode = this._graphicContainer.getChildByName(`ArrowPath_${pathIndex}`);
        if (!graphicsNode) return;
        const graphics = graphicsNode.getComponent(cc.Graphics);
        if (!graphics) return;
        graphics.strokeColor = color;
        graphics.fillColor = color;
        this.drawPath(graphics, pathIndex, color);
    }

    /**
     * 路径移动：只推进头尾，保持中间段稳定
     * @param speedRatio 速度倍率（1 = 基础速度）
     * @param pathIdx 路径索引
     * @param isError 预留参数，兼容调用
     */
    public arrowPathMove(speedRatio: number = 1, pathIdx: number, isError: boolean = false): void {
        if (pathIdx < 0 || pathIdx >= this._arrowPaths.length) return;
        if (this._pathLeftMap.get(pathIdx)) return;
        if (this._blockedFeedback && this._blockedFeedback.pathIdx === pathIdx) return;

        const path = this._arrowPaths[pathIdx];
        const rowColPath = this._arrowPathsByRowCol[pathIdx];
        if (!path || path.length <= 1) {
            this._pathLeftMap.set(pathIdx, true);
            return;
        }

        // 参考逻辑：速度由圆点间距决定，并受倍率控制
        const speed = this._mapRoundGap * 0.125 * speedRatio;

        // 1) 头部前进（由第二点指向第一点）
        const headDir = this.getDir(path[1].x, path[1].y, path[0].x, path[0].y);
        path[0].x += headDir.x * speed;
        path[0].y += headDir.y * speed;

        // 2) 尾部前进（由尾点指向倒数第二点）
        const lastIdx = path.length - 1;
        const tailDir = this.getDir(path[lastIdx].x, path[lastIdx].y, path[lastIdx - 1].x, path[lastIdx - 1].y);
        path[lastIdx].x += tailDir.x * speed;
        path[lastIdx].y += tailDir.y * speed;

        // 3) 尾部与倒数第二点重合时，缩短路径
        const tolerance = this._mapRoundGap * 0.01;
        if (
            Math.abs(path[lastIdx].x - path[lastIdx - 1].x) < tolerance &&
            Math.abs(path[lastIdx].y - path[lastIdx - 1].y) < tolerance
        ) {
            path.pop();
            if (rowColPath && rowColPath.length > 0) {
                rowColPath.pop();
            }
        }

        // 4) 离场判定：避免过早结束，仅在路径极短时按方向判定是否离场
        if (!path || path.length <= 1) {
            this._pathLeftMap.set(pathIdx, true);
            return;
        }
        if (path.length === 2) {
            const head = path[0];
            const dir = this.getDir(path[1].x, path[1].y, path[0].x, path[0].y);
            const mapHalfW = this._mapNode.width * 0.5;
            const mapHalfH = this._mapNode.height * 0.5;
            const leavePadding = this._mapRoundGap * 15.5;

            if (dir.x > 0 && head.x >= mapHalfW + leavePadding) {
                this._pathLeftMap.set(pathIdx, true);
                return;
            }
            if (dir.x < 0 && head.x <= -mapHalfW - leavePadding) {
                this._pathLeftMap.set(pathIdx, true);
                return;
            }
            if (dir.y > 0 && head.y >= mapHalfH + leavePadding) {
                this._pathLeftMap.set(pathIdx, true);
                return;
            }
            if (dir.y < 0 && head.y <= -mapHalfH - leavePadding) {
                this._pathLeftMap.set(pathIdx, true);
                return;
            }
        }
    }

    /**
     * 检查路径是否被阻挡
     * @param pathIdx 路径索引
     * @param dir 移动方向
     * @returns 阻挡距离（0=未阻挡）
     */
    public isPathBlocked(pathIdx: number, dir: IDirection): number {
        // 简化实现：默认返回0（未阻挡）
        return 0;
    }

    /**
     * 获取圆点间距
     * @returns 间距值
     */
    public getMapRoundGap(): number {
        return this._mapRoundGap;
    }

    // 每条路径的颜色配置，按路径索引顺序，格式: [r, g, b, a]
    // 路径索引0对应第一条箭头，索引1对应第二条，以此类推
    private _pathColors: number[][] = [
        [234, 180, 34,  255],  // 路径0：黄色
        [80,  180, 255, 255],  // 路径1：蓝色
        [80,  220, 100, 255],  // 路径2：绿色
    ];

    /**
     * 生成所有路径的Graphics绘制 (2.x TS 版本)
     * @param graphicContainer 绘制容器节点
     * @param graphicsPre Graphics预制体
     */
    public createAllPathGraphics(graphicContainer: cc.Node, graphicsPre: cc.Prefab): void {
        if (!graphicContainer || !graphicsPre) {
            console.warn("绘制容器或Graphics预制体未指定");
            return;
        }

        this._graphicContainer = graphicContainer;
        this._graphicsPre = graphicsPre;
        graphicContainer.removeAllChildren();

        const arrowPaths = this.getArrowPaths();
        const delayBetweenPaths = 0.03;

        // 逐个创建路径绘制
        for (let pathIndex = 0; pathIndex < arrowPaths.length; pathIndex++) {
            setTimeout(() => {
                this.createPathGraphics(pathIndex, graphicContainer, graphicsPre);
            }, pathIndex * delayBetweenPaths * 1000);
        }
    }

    /**
     * 创建单个路径的Graphics绘制 (2.x TS 版本)
     * @param pathIndex 路径索引
     * @param graphicContainer 绘制容器
     * @param graphicsPre Graphics预制体
     */
    private createPathGraphics(pathIndex: number, graphicContainer: cc.Node, graphicsPre: cc.Prefab): void {
        const graphicsNode = cc.instantiate(graphicsPre);
        graphicsNode.name = `ArrowPath_${pathIndex}`;
        graphicsNode.parent = graphicContainer;
        graphicsNode.setPosition(0, 0);

        const graphics = graphicsNode.getComponent(cc.Graphics);
        if (!graphics) {
            console.warn("Graphics组件未找到");
            graphicsNode.destroy();
            return;
        }

        // 取当前路径颜色，超出配置范围时回退到默认色
        const colorCfg = this._pathColors[pathIndex] || [12, 22, 49, 255];
        const pathColor = new cc.Color(colorCfg[0], colorCfg[1], colorCfg[2], colorCfg[3]);

        // 设置绘制样式 (2.x TS 版本)
        graphics.lineJoin = cc.Graphics.LineJoin.ROUND;
        graphics.miterLimit = 15;
        graphics.lineCap = cc.Graphics.LineCap.ROUND;
        graphics.lineWidth = this._pathLineWidth;
        graphics.strokeColor = pathColor;
        graphics.fillColor = pathColor;

        // 绘制路径
        this.drawPath(graphics, pathIndex, pathColor);
    }

    /**
     * 绘制单个路径 (2.x TS 版本)
     * @param graphics Graphics组件
     * @param pathIndex 路径索引
     * @param color 路径颜色
     */
    private drawPath(graphics: cc.Graphics, pathIndex: number, color: cc.Color = new cc.Color(12, 22, 49, 255)): void {
        const path = this.getArrowPaths()[pathIndex];
        if (!path || path.length < 2) {
            graphics.clear();
            return;
        }

        graphics.clear();

        // 拐角圆角半径
        const cornerRadius = Math.min(graphics.lineWidth * 0.8, 8);

        // 绘制路径线条 (核心逻辑完全匹配你的代码)
        graphics.moveTo(path[path.length - 1].x, path[path.length - 1].y);
        for (let i = path.length - 2; i >= 0; i--) {
            const currentPoint = path[i];
            if (i > 0) {
                // 拐角处添加圆弧
                const prevPoint = path[i + 1];
                const nextPoint = path[i - 1];

                const dx1 = currentPoint.x - prevPoint.x;
                const dy1 = currentPoint.y - prevPoint.y;
                const dx2 = nextPoint.x - currentPoint.x;
                const dy2 = nextPoint.y - currentPoint.y;

                const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
                const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                if (len1 > 0.1 && len2 > 0.1) {
                    const radius = Math.min(cornerRadius, len1 * 0.4, len2 * 0.4);
                    const t1 = 1 - radius / len1;
                    const t2 = radius / len2;

                    const controlX1 = prevPoint.x + dx1 * t1;
                    const controlY1 = prevPoint.y + dy1 * t1;
                    const controlX2 = currentPoint.x + dx2 * t2;
                    const controlY2 = currentPoint.y + dy2 * t2;

                    graphics.lineTo(controlX1, controlY1);
                    graphics.quadraticCurveTo(currentPoint.x, currentPoint.y, controlX2, controlY2);
                } else {
                    graphics.lineTo(currentPoint.x, currentPoint.y);
                }
            } else {
                graphics.lineTo(currentPoint.x, currentPoint.y);
            }
        }
        graphics.stroke();

        // 绘制箭头
        if (path.length >= 2) {
            const startX = path[1].x;
            const startY = path[1].y;
            const endX = path[0].x;
            const endY = path[0].y;
            const dir = this.getDir(startX, startY, endX, endY);
            this.drawArrow(graphics, endX, endY, dir, color);
        }
    }

    /**
     * 绘制箭头（圆润三角形） (完全匹配你的核心逻辑)
     * @param graphics Graphics组件
     * @param endX 箭头尖端X
     * @param endY 箭头尖端Y
     * @param dir 箭头方向
     * @param color 箭头颜色
     */
    private drawArrow(graphics: cc.Graphics, endX: number, endY: number, dir: IDirection, color: cc.Color = new cc.Color(12, 22, 49, 255)): void {
        const scale = 1.5;
        // 箭头顶点（相对于尖端）
        const topLeft = { x: -3 * scale, y: 13 * scale };
        const topRight = { x: 3 * scale, y: 13 * scale };
        const rightTop = { x: 13 * scale, y: 3 * scale };
        const rightBottom = { x: 13 * scale, y: -3 * scale };
        const leftTop = { x: -13 * scale, y: 3 * scale };
        const leftBottom = { x: -13 * scale, y: -3 * scale };

        // 圆弧控制点
        const topCenter = { x: 0, y: 17 * scale };
        const rightCenter = { x: 15 * scale, y: 0 };
        const leftCenter = { x: -15 * scale, y: 0 };

        // 旋转点计算
        const rotatePoint = (p: { x: number, y: number }): IPathPoint => {
            const rotatedX = p.x * (-dir.y) + p.y * dir.x;
            const rotatedY = p.x * dir.x + p.y * dir.y;
            return {
                x: endX + rotatedX,
                y: endY + rotatedY
            };
        };

        // 转换所有点到世界坐标
        const topLeftWorld = rotatePoint(topLeft);
        const topRightWorld = rotatePoint(topRight);
        const rightTopWorld = rotatePoint(rightTop);
        const rightBottomWorld = rotatePoint(rightBottom);
        const leftTopWorld = rotatePoint(leftTop);
        const leftBottomWorld = rotatePoint(leftBottom);

        const topCenterWorld = rotatePoint(topCenter);
        const rightCenterWorld = rotatePoint(rightCenter);
        const leftCenterWorld = rotatePoint(leftCenter);

        // 绘制箭头 (完全匹配你的逻辑)
        graphics.moveTo(topLeftWorld.x, topLeftWorld.y);
        graphics.quadraticCurveTo(topCenterWorld.x, topCenterWorld.y, topRightWorld.x, topRightWorld.y);
        graphics.lineTo(rightTopWorld.x, rightTopWorld.y);
        graphics.quadraticCurveTo(rightCenterWorld.x, rightCenterWorld.y, rightBottomWorld.x, rightBottomWorld.y);
        graphics.lineTo(leftBottomWorld.x, leftBottomWorld.y);
        graphics.quadraticCurveTo(leftCenterWorld.x, leftCenterWorld.y, leftTopWorld.x, leftTopWorld.y);
        graphics.lineTo(topLeftWorld.x, topLeftWorld.y);

        graphics.close();
        graphics.fillColor = color;
        graphics.fill();
    }

    /**
     * 获取路径总数
     */
    public getPathCount(): number {
        return this._arrowPaths.length;
    }

    /**
     * 点击命中检测：返回被点击的路径索引，无命中返回 -1
     * @param worldX 世界坐标X（touch.getLocation()）
     * @param worldY 世界坐标Y
     */
    public getPathIndexAtPoint(worldX: number, worldY: number): number {
        if (!this._mapNode) return -1;
        const localPos = this._mapNode.convertToNodeSpaceAR(cc.v2(worldX, worldY));
        const hitRadius = Math.max(20, this._mapRoundGap * 0.4);

        for (let i = 0; i < this._arrowPaths.length; i++) {
            if (this._pathLeftMap.get(i)) continue;
            const path = this._arrowPaths[i];
            if (!path || path.length < 2) continue;
            for (let j = 0; j < path.length - 1; j++) {
                if (this.distPointToSegment(localPos.x, localPos.y, path[j], path[j + 1]) <= hitRadius) {
                    return i;
                }
            }
        }
        return -1;
    }

    /** 点到线段的距离 */
    private distPointToSegment(px: number, py: number, a: IPathPoint, b: IPathPoint): number {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 0.01) {
            return Math.sqrt((px - a.x) ** 2 + (py - a.y) ** 2);
        }
        const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lenSq));
        return Math.sqrt((px - (a.x + t * dx)) ** 2 + (py - (a.y + t * dy)) ** 2);
    }

    /**
     * 刷新指定路径的Graphics绘制（移动后每帧调用）
     * @param pathIndex 路径索引
     */
    public refreshPathGraphics(pathIndex: number): void {
        if (!this._graphicContainer) return;
        const graphicsNode = this._graphicContainer.getChildByName(`ArrowPath_${pathIndex}`);
        if (!graphicsNode) return;
        const graphics = graphicsNode.getComponent(cc.Graphics);
        if (!graphics) return;
        const override = this._pathColorOverride.get(pathIndex);
        const colorCfg = this._pathColors[pathIndex] || [12, 22, 49, 255];
        const pathColor = override
            ? new cc.Color(override.r, override.g, override.b, override.a)
            : new cc.Color(colorCfg[0], colorCfg[1], colorCfg[2], colorCfg[3]);
        graphics.strokeColor = pathColor;
        graphics.fillColor = pathColor;
        this.drawPath(graphics, pathIndex, pathColor);
    }
}