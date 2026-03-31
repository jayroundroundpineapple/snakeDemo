// LevelConfig.ts
/** 路径方向接口 */
export interface IDirection {
    x: number;
    y: number;
}

/** 路径点坐标接口 */
export interface IPathPoint {
    x: number;
    y: number;
}

/** 路径行列索引接口 */
export interface IPathRowCol {
    row: number;
    col: number;
}

/** 关卡配置接口 */
export interface LevelConfig {
    level: number;
    isHard: boolean;
    arrowPaths: number[][];
}

/** 关卡JSON结构 */
export interface LevelsJson {
    levels: LevelConfig[];
}