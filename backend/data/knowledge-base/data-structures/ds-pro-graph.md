---
sourceKey: ds-pro-graph
title: 数据结构讲义·图的基本概念与存储
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: 数据结构
chapter: 图
language: zh-CN
sourceType: team_authored
documentKey: ds-pro-graph
---

# 图的基本概念与存储

## 图的定义
图 G 由顶点集 V 和边集 E 组成，记作 G=(V, E)。V 是顶点的有限非空集合，E 是顶点之间关系的有限集合。图中顶点数记为 |V|，边数记为 |E|。图不能是空图——顶点集必须非空，但边集可以为空。

## 有向图与无向图
若边是有序对 <v, w>，称为弧，v 是弧尾、w 是弧头，这样的图称为有向图。若边是无序对 (v, w)，称为边，这样的图称为无向图，v 与 w 互为邻接点。无向图中边依附于它的两个顶点。

## 度、入度与出度
无向图中顶点 v 的度是与它相关联的边的数目，记为 TD(v)。有向图中顶点的度分为入度 ID(v)（以 v 为弧头的弧数）和出度 OD(v)（以 v 为弧尾的弧数），TD(v) = ID(v) + OD(v)。无向图中所有顶点的度数之和等于边数的两倍，即 ΣTD(v) = 2|E|；有向图中入度之和等于出度之和，都等于边数。

## 路径、回路与连通性
路径是顶点序列，路径长度是路径上边的数目。第一个顶点和最后一个顶点相同的路径称为回路（环）。若路径上顶点不重复，称为简单路径；若回路除首尾外顶点不重复，称为简单回路。无向图中若任意两顶点间都有路径，则称图是连通图，否则其极大连通子图称为连通分量。有向图中若任意两顶点间都有双向路径，称为强连通图，其极大强连通子图称为强连通分量。

## 完全图与稠密稀疏
无向完全图有 n(n−1)/2 条边，任意两顶点间都有边。有向完全图有 n(n−1) 条弧。边数接近完全图的图称为稠密图，边数远小于完全图的称为稀疏图。这一区分直接决定存储结构的选择。

## 生成树与生成森林
连通图的生成树是包含图中全部顶点的一个极小连通子图，有 n 个顶点、n−1 条边。非连通图的每个连通分量各有一棵生成树，合称生成森林。带权连通图中权值之和最小的生成树称为最小生成树。

## 邻接矩阵存储
邻接矩阵用一个二维数组 A[i][j] 表示顶点 i 到 j 是否有边（或存储权值）。无向图的邻接矩阵是对称矩阵，第 i 行（列）非零元素个数等于顶点 i 的度。有向图中第 i 行非零元素个数为出度，第 i 列为入度。邻接矩阵空间复杂度 O(n²)，判断两点是否相邻为 O(1)，但求某顶点的全部邻接点需 O(n)，适合稠密图。

## 邻接表存储
邻接表为每个顶点建立一个单链表，链表中存放该顶点的所有邻接点。空间复杂度 O(n+e)，适合稀疏图。求某顶点的全部邻接点只需遍历其链表，效率高；但判断两点间是否存在边需要遍历链表，不如邻接矩阵方便。有向图的邻接表只存出边，求入度需要建立逆邻接表。

## 十字链表与邻接多重表
十字链表用于有向图，每个弧结点同时挂在起点的出边表和终点的入边表上，因此同时方便求出度和入度。邻接多重表用于无向图，每条边只用一个结点表示，该结点同时挂在两端顶点的边表中，避免了邻接表中一条边被存储两次的问题，便于删除边。

## 完整代码：邻接矩阵与邻接表
```c
#include <stdio.h>
#include <stdlib.h>
#define MAXV 100
#define INF 0x3f3f3f3f

/* ---------- 邻接矩阵 ---------- */
typedef struct {
    int vexs[MAXV];              // 顶点表
    int edge[MAXV][MAXV];        // 邻接矩阵，0 表示无边
    int vexnum, arcnum;
} MGraph;

void CreateMGraph(MGraph *G) {
    scanf("%d %d", &G->vexnum, &G->arcnum);
    for (int i = 0; i < G->vexnum; i++) scanf("%d", &G->vexs[i]);
    for (int i = 0; i < G->vexnum; i++)
        for (int j = 0; j < G->vexnum; j++) G->edge[i][j] = 0;
    for (int k = 0; k < G->arcnum; k++) {
        int i, j, w; scanf("%d %d %d", &i, &j, &w);
        G->edge[i][j] = w;                       // 无向图需同时赋值 edge[j][i]
    }
}

/* ---------- 邻接表 ---------- */
typedef struct ArcNode {          // 边结点
    int adjvex;                   // 该边指向的顶点下标
    int weight;                   // 权值
    struct ArcNode *nextarc;
} ArcNode;

typedef struct VNode {            // 顶点结点
    int data;
    ArcNode *firstarc;
} VNode, AdjList[MAXV];

typedef struct {
    AdjList vertices;
    int vexnum, arcnum;
} ALGraph;

void CreateALGraph(ALGraph *G) {
    scanf("%d %d", &G->vexnum, &G->arcnum);
    for (int i = 0; i < G->vexnum; i++) { scanf("%d", &G->vertices[i].data); G->vertices[i].firstarc = NULL; }
    for (int k = 0; k < G->arcnum; k++) {
        int i, j, w; scanf("%d %d %d", &i, &j, &w);
        ArcNode *p = (ArcNode*)malloc(sizeof(ArcNode));
        p->adjvex = j; p->weight = w; p->nextarc = G->vertices[i].firstarc;
        G->vertices[i].firstarc = p;
        // 无向图需再插入一条 i 到 j 的反向边
    }
}
```

## 存储结构的选择
稠密图、需要频繁判断两点是否相邻、或需要矩阵运算（如 Floyd 算法）时选邻接矩阵。稀疏图、需要频繁遍历某顶点的邻接点、或图规模很大时选邻接表。需要同时高效求出度与入度的有向图选十字链表；需要频繁删除边的无向图选邻接多重表。

## 常见易错点
无向图邻接矩阵对称，统计边数时不要重复计数。邻接表中无向图每条边出现两次，因此边结点总数为 2e。混淆连通与强连通（前者针对无向图，后者针对有向图）。把"极大连通子图"与"极小连通子图"（生成树）混淆。完全图边数公式对有向与无向图不同。

## 本节小结
图是最一般的非线性结构，顶点间关系可以是任意的。邻接矩阵与邻接表是最基本的两种存储方式，前者以 O(n²) 空间换取 O(1) 的判边能力，后者以 O(n+e) 空间换取高效的邻接点遍历。理解度的计算、连通性概念和各种特殊图的边数，是学习图算法的前提。
