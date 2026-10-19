---
sourceKey: ds-pro-graph-path
title: 数据结构讲义·最短路径、拓扑排序与关键路径
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: 数据结构
chapter: 最短路径
language: zh-CN
sourceType: team_authored
documentKey: ds-pro-graph-path
---

# 最短路径、拓扑排序与关键路径

## 最短路径问题分类
最短路径问题分两类：单源最短路径（求一个源点到其余各顶点的最短路径），常用 Dijkstra 与 Bellman-Ford；多源最短路径（求任意两顶点间的最短路径），常用 Floyd。无权图的最短路径可用 BFS 直接求得。

## Dijkstra 算法
Dijkstra 采用贪心策略：维护已确定最短路径的顶点集合 S，每轮从未确定的顶点中选出当前距离最小的顶点 u 加入 S，并用 u 松弛其邻接点（若 dist[u] + w(u,v) < dist[v] 则更新 dist[v]）。算法正确的前提是**所有边权非负**——因为一旦某顶点被加入 S，就要求后续不可能通过其他路径得到更短距离。

## Dijkstra 的复杂度
用邻接矩阵实现时，每轮选最小需要 O(n)，共 n 轮，加上松弛 O(n)，总复杂度 O(n²)。用邻接表 + 小根堆（优先队列）优化后，复杂度为 O((n+e) log n)。堆优化适合稀疏图。

## Floyd 算法
Floyd 用动态规划求所有点对最短路径。设 d[k][i][j] 表示只允许经过前 k 个顶点作为中间点时 i 到 j 的最短路径长度，则递推为 d[i][j] = min(d[i][j], d[i][k] + d[k][j])。三重循环（枚举中间点 k 在最外层）即可在原矩阵上原地更新。时间复杂度 O(n³)，空间 O(n²)，可处理负权边（但不能有负权回路）。三重循环中 k 必须在最外层，否则结果错误。

## Bellman-Ford 与 SPFA
Bellman-Ford 对所有边进行 n−1 轮松弛，每轮遍历全部边。由于最短路径最多含 n−1 条边，n−1 轮后必然收敛。若第 n 轮仍能松弛，说明存在负权回路。复杂度 O(n×e)，可处理负权边。SPFA 是 Bellman-Ford 的队列优化版本：仅当某顶点的距离被更新时才把它入队，平均较快，但最坏仍可能退化到 O(n×e)。

## 完整代码：Dijkstra 与 Floyd
```c
#define INF 0x3f3f3f3f
#define MAXV 100

/* Dijkstra：邻接矩阵，dist 保存最短距离，path 保存前驱 */
void Dijkstra(int G[][MAXV], int n, int s, int dist[], int path[]) {
    int visited[MAXV] = {0};
    for (int i = 0; i < n; i++) { dist[i] = INF; path[i] = -1; }
    dist[s] = 0;
    for (int k = 0; k < n; k++) {
        int u = -1;
        for (int i = 0; i < n; i++)
            if (!visited[i] && (u == -1 || dist[i] < dist[u])) u = i;
        if (u == -1 || dist[u] == INF) break;        // 剩余顶点不可达
        visited[u] = 1;
        for (int v = 0; v < n; v++)
            if (!visited[v] && G[u][v] && dist[u] + G[u][v] < dist[v]) {
                dist[v] = dist[u] + G[u][v];
                path[v] = u;                         // 记录前驱以便回溯路径
            }
    }
}

/* Floyd：原地更新，d 初始为邻接矩阵（无边为 INF，自身为 0） */
void Floyd(int d[][MAXV], int n) {
    for (int k = 0; k < n; k++)                      // 中间点必须在最外层
        for (int i = 0; i < n; i++)
            for (int j = 0; j < n; j++)
                if (d[i][k] != INF && d[k][j] != INF && d[i][k] + d[k][j] < d[i][j])
                    d[i][j] = d[i][k] + d[k][j];
}
```

## 拓扑排序（AOV 网）
AOV 网是用顶点表示活动、用有向边表示活动之间先后关系的网。拓扑排序把 AOV 网中所有顶点排成一个线性序列，使得对每条弧 <u,v>，u 在序列中都排在 v 之前。算法步骤：统计所有顶点的入度；把入度为 0 的顶点入队；反复出队一个顶点并输出，同时把它的所有后继顶点入度减 1，减到 0 的入队。若输出的顶点数少于总顶点数，说明网中存在有向环，拓扑排序不存在。

## 拓扑排序的性质与应用
拓扑序列通常不唯一。如果在排序过程中队列里始终只有一个顶点，则该拓扑序列唯一（等价于 AOV 网存在一条经过所有顶点的有向路径）。拓扑排序可用于判断有向图是否存在环、安排课程先修顺序、任务调度、以及为 DAG 上的动态规划确定计算顺序。

## 完整代码：拓扑排序（邻接表）
```c
typedef struct ArcNode { int adjvex; struct ArcNode *nextarc; } ArcNode;
typedef struct { int data; ArcNode *firstarc; } VNode, AdjList[MAXV];
typedef struct { AdjList vertices; int vexnum, arcnum; } ALGraph;

int TopologicalSort(ALGraph *G, int order[]) {
    int indegree[MAXV] = {0}, queue[MAXV], front = 0, rear = 0, cnt = 0;
    for (int v = 0; v < G->vexnum; v++)               // 统计入度
        for (ArcNode *p = G->vertices[v].firstarc; p; p = p->nextarc)
            indegree[p->adjvex]++;
    for (int v = 0; v < G->vexnum; v++)
        if (indegree[v] == 0) queue[rear++] = v;
    while (front < rear) {
        int u = queue[front++];
        order[cnt++] = u;
        for (ArcNode *p = G->vertices[u].firstarc; p; p = p->nextarc)
            if (--indegree[p->adjvex] == 0) queue[rear++] = p->adjvex;
    }
    return cnt == G->vexnum;                          // 1 表示无环，0 表示有环
}
```

## 关键路径（AOE 网）
AOE 网用边表示活动（边权为活动持续时间）、用顶点表示事件。只有进入某顶点的所有活动都结束，该事件才发生。关键路径是 AOE 网中从源点到汇点最长的路径，其长度决定整个工程的最短完成时间。
- 事件最早发生时间 ve(v)：从源点出发的最长路径长度，按拓扑序递推。
- 事件最迟发生时间 vl(v)：在不推迟工期的前提下事件最晚发生时间，按逆拓扑序递推，汇点 vl = ve。
- 活动最早开始时间 e(a) = ve(弧尾)，活动最迟开始时间 l(a) = vl(弧头) − 活动持续时间。
- 时间余量 l(a) − e(a) = 0 的活动为关键活动，关键活动组成关键路径。

## 关键路径的性质
关键路径可能不唯一。缩短关键活动的持续时间可能缩短总工期，但若该活动在全部关键路径上；缩短非关键活动不能缩短工期，除非它变成关键活动。加快关键活动也可能使原本非关键的活动变成关键活动，因此不能被无限压缩。

## 常见易错点
Dijkstra 用于负权图会得到错误结果。Floyd 的三重循环把 k 放在内层。Bellman-Ford 忘记检测负权回路。拓扑排序判断有环时看的是输出顶点数是否等于顶点总数。关键路径公式中 e 用弧尾的 ve、l 用弧头的 vl 减去持续时间，容易记混。把"最长路径"与"最短路径"算法混用。

## 本节小结
最短路径解决"怎么走最省"的问题，Dijkstra 适用于非负权单源、Floyd 适用于全源、Bellman-Ford 可处理负权。拓扑排序为有向无环图建立线性次序，是判断有环与安排先后关系的标准工具。关键路径在 AOE 网中找出决定工期的活动序列，是工程进度管理的核心方法。
