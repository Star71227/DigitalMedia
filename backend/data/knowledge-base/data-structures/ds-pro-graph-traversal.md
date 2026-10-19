---
sourceKey: ds-pro-graph-traversal
title: 数据结构讲义·图的遍历与最小生成树
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: 数据结构
chapter: 图遍历
language: zh-CN
sourceType: team_authored
documentKey: ds-pro-graph-traversal
---

# 图的遍历与最小生成树

## 图的遍历概述
图的遍历是从某个顶点出发，按某种策略访问图中所有顶点且每个顶点仅访问一次。为避免重复访问，需要设置 visited 数组。图可能不连通，因此需要在外层对每个未访问顶点各调用一次遍历算法，才能覆盖所有连通分量。

## 深度优先搜索 DFS
DFS 从起始顶点出发，访问该顶点后递归地访问其第一个未访问邻接点，直到无路可走再回溯。DFS 类似树的先根遍历，天然用递归（或显式栈）实现。

## 广度优先搜索 BFS
BFS 从起始顶点出发，先访问其所有邻接点，再依次访问这些邻接点的邻接点，逐层向外扩展。BFS 借助队列实现。在无权图中，BFS 首次到达某顶点所经过的边数就是最短路径长度。

## 两个遍历的复杂度
对邻接表存储的图，DFS 与 BFS 的时间复杂度都是 O(n+e)——每个顶点访问一次，每条边扫描一次（无向图每条边扫描两次）。对邻接矩阵存储的图，都需要 O(n²)，因为查找某顶点的所有邻接点要扫描整行。

## 完整代码：DFS 与 BFS
```c
#include <stdio.h>
#include <string.h>
#define MAXV 100

int visited[MAXV];

/* 邻接矩阵版 DFS */
void DFS_M(int G[][MAXV], int n, int v) {
    visited[v] = 1;
    printf("%d ", v);
    for (int j = 0; j < n; j++)
        if (G[v][j] && !visited[j]) DFS_M(G, n, j);
}

/* 邻接表版 BFS */
typedef struct ArcNode { int adjvex; struct ArcNode *nextarc; } ArcNode;
typedef struct { int data; ArcNode *firstarc; } VNode, AdjList[MAXV];
typedef struct { AdjList vertices; int vexnum, arcnum; } ALGraph;

void BFS(ALGraph *G, int v) {
    int queue[MAXV], front = 0, rear = 0;
    memset(visited, 0, sizeof(visited));
    visited[v] = 1; queue[rear++] = v;
    while (front < rear) {
        int u = queue[front++];
        printf("%d ", G->vertices[u].data);
        for (ArcNode *p = G->vertices[u].firstarc; p; p = p->nextarc) {
            if (!visited[p->adjvex]) {
                visited[p->adjvex] = 1;
                queue[rear++] = p->adjvex;
            }
        }
    }
}

/* 遍历非连通图：对每个未访问顶点各调用一次 */
void TraverseAll(ALGraph *G) {
    memset(visited, 0, sizeof(visited));
    for (int v = 0; v < G->vexnum; v++)
        if (!visited[v]) BFS(G, v);
}
```

## 遍历生成树
对连通图，从某顶点出发的 DFS 或 BFS 会经过 n−1 条边，这些边连同全部顶点构成一棵生成树，分别称为 DFS 生成树和 BFS 生成树。对非连通图则得到生成森林。DFS 生成树通常较深，BFS 生成树通常较矮（层数等于从起点到最远点的最短距离）。

## 最小生成树的概念
对于带权连通无向图（网），各生成树中边权之和最小的那棵称为最小生成树（MST）。最小生成树的边权之和唯一，若各边权值互不相同则最小生成树唯一。MST 有 n−1 条边，且不会形成回路。

## Prim 算法
Prim 算法从任一顶点开始构造：维护已选顶点集合，每次选取连接"已选集合"与"未选集合"的权值最小的边，把新顶点加入集合。使用邻接矩阵时时间复杂度 O(n²)，与边数无关，适合稠密图；用堆与邻接表优化后可降至 O(e log n)。

## Kruskal 算法
Kruskal 算法按边权从小到大依次考察每条边，若该边两端点当前不在同一连通分量中（用并查集判断）则加入，否则丢弃（会成环）。时间复杂度 O(e log e)，主要由排序决定，适合稀疏图。

## 完整代码：Prim 与 Kruskal
```c
#define INF 0x3f3f3f3f
/* Prim：邻接矩阵，返回最小生成树权值和，-1 表示不连通 */
int Prim(int G[][MAXV], int n) {
    int lowcost[MAXV], visited[MAXV], sum = 0;
    for (int i = 0; i < n; i++) { lowcost[i] = INF; visited[i] = 0; }
    lowcost[0] = 0;                                  // 从顶点 0 开始
    for (int k = 0; k < n; k++) {
        int u = -1;
        for (int i = 0; i < n; i++)
            if (!visited[i] && (u == -1 || lowcost[i] < lowcost[u])) u = i;
        if (u == -1 || lowcost[u] == INF) return -1;  // 不连通
        visited[u] = 1; sum += lowcost[u];
        for (int v = 0; v < n; v++)
            if (!visited[v] && G[u][v] && G[u][v] < lowcost[v]) lowcost[v] = G[u][v];
    }
    return sum;
}

/* Kruskal：并查集判环 */
typedef struct { int u, v, w; } Edge;
int parent[MAXV];
int Find(int x) { return parent[x] == x ? x : (parent[x] = Find(parent[x])); }
int CmpEdge(const void *a, const void *b) { return ((Edge*)a)->w - ((Edge*)b)->w; }

int Kruskal(Edge edges[], int e, int n) {
    for (int i = 0; i < n; i++) parent[i] = i;
    qsort(edges, e, sizeof(Edge), CmpEdge);          // 按权值升序
    int sum = 0, cnt = 0;
    for (int i = 0; i < e && cnt < n - 1; i++) {
        int ru = Find(edges[i].u), rv = Find(edges[i].v);
        if (ru == rv) continue;                      // 会成环，丢弃
        parent[ru] = rv; sum += edges[i].w; cnt++;
    }
    return cnt == n - 1 ? sum : -1;                  // 不足 n-1 条边则不连通
}
```

## Prim 与 Kruskal 的比较
Prim 以顶点为中心扩展，复杂度取决于顶点数，适合稠密图（边多）。Kruskal 以边为中心，复杂度取决于边数，适合稀疏图。两者都基于贪心策略，且都正确——这由 MST 的割性质（任意割的最小跨越边必属于某棵 MST）保证。

## 常见易错点
DFS 用队列、BFS 用栈（两者恰好相反）。忘记设置访问标记导致死循环或重复访问。遍历非连通图时只从一个顶点出发，导致遗漏连通分量。Prim 更新的是"到已选集合的最小边权"，而 Dijkstra 更新的是"到源点的最短距离"，两者极易混淆。Kruskal 忘记判环或并查集 Find 未路径压缩。

## 本节小结
DFS 与 BFS 是图算法的两大基本框架，前者适合求连通性、拓扑序、割点等结构性质，后者适合求无权图最短路径与层次关系。最小生成树解决"以最小代价连通全部顶点"的问题，Prim 与 Kruskal 分别从顶点和边出发，各适合稠密与稀疏图。
