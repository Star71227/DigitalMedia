---
sourceKey: ds-pro-stack-queue
title: 数据结构讲义·栈与队列
author: 课程资料整理组
publisher: 华五项目组
license: CC-BY-4.0
version: 1.0.0
subject: 数据结构
chapter: 栈与队列
language: zh-CN
sourceType: team_authored
documentKey: ds-pro-stack-queue
---

# 栈与队列

## 栈的定义
栈是只允许在同一端（栈顶）进行插入和删除的线性表，特点是后进先出（LIFO）。栈的基本操作包括入栈 push、出栈 pop、取栈顶元素 getTop、判空 isEmpty。栈顶指针指示当前栈顶位置。

## 顺序栈
顺序栈用数组存放元素，top 指示栈顶下标。约定 top 指向栈顶元素时，初始 top = −1，入栈时 ++top 后赋值，出栈时取 top 再 −−top。栈满条件为 top == MaxSize−1，栈空条件为 top == −1。

## 链栈
链栈通常用不带头结点的单链表实现，栈顶即链表头。入栈即在表头插入结点，出栈即删除表头结点，两者时间复杂度均为 O(1)。链栈不存在栈满问题（受内存限制）。

## 共享栈
两个顺序栈共享一段数组空间，两个栈分别从两端向中间增长。栈满条件为 top0 + 1 == top1。共享栈提高空间利用率，但只适合两个栈元素总数可预估的场景。

## 栈的应用：括号匹配
遇到左括号入栈，遇到右括号时与栈顶比较，若匹配则弹出栈顶，否则匹配失败。扫描结束后栈为空说明全部匹配。时间复杂度 O(n)，空间复杂度 O(n)。

## 栈的应用：表达式求值
中缀表达式转后缀（逆波兰）表达式的规则：操作数直接输出；运算符入栈前先弹出栈中优先级不低于它的运算符；左括号直接入栈，右括号则弹出至左括号。后缀表达式求值时，操作数入栈，遇运算符弹出两个操作数运算后再压回，最终栈顶即为结果。

## 栈的应用：递归
递归调用依赖系统栈保存返回地址、参数和局部变量。递归深度决定栈空间占用，递归过深可能栈溢出。任何递归都可以用显式栈改为非递归，尾递归可以被编译器优化。

## 队列的定义
队列是只允许在队尾插入、在队头删除的线性表，特点是先进先出（FIFO）。基本操作包括入队 enqueue、出队 dequeue、取队头元素。

## 循环队列
顺序队列出队后队头空间无法复用，导致假溢出。循环队列用取模运算把数组首尾相连：入队 rear = (rear+1)%MaxSize，出队 front = (front+1)%MaxSize。牺牲一个存储单元时，队空条件 front == rear，队满条件 (rear+1)%MaxSize == front，队列最多存放 MaxSize−1 个元素。

## 循环队列的三种判满方法
一是牺牲一个单元（如上）。二是增设 size 变量记录元素个数，队空 size == 0，队满 size == MaxSize。三是增设 tag 标志，最近一次是入队则 tag=1，是出队则 tag=0，队空为 front==rear 且 tag==0，队满为 front==rear 且 tag==1。

## 链队列
链队列用带头结点的单链表实现，同时维护队头指针和队尾指针。入队在队尾插入，出队在队头删除，时间复杂度均为 O(1)。出队时若删除的是最后一个结点，需把队尾指针重新指向头结点。

## 双端队列
双端队列允许两端插入和删除。输入受限的双端队列允许一端插入删除、另一端只能删除；输出受限的双端队列允许一端插入删除、另一端只能插入。常见考法是给定输入序列，判断某输出序列是否可由受限双端队列得到。

## 完整代码：顺序栈与循环队列
```c
#define MaxSize 100
typedef struct { int data[MaxSize]; int top; } SqStack;

void InitStack(SqStack *S) { S->top = -1; }
int StackEmpty(SqStack *S) { return S->top == -1; }
int Push(SqStack *S, int x) { if (S->top == MaxSize - 1) return 0; S->data[++S->top] = x; return 1; }
int Pop(SqStack *S, int *x) { if (StackEmpty(S)) return 0; *x = S->data[S->top--]; return 1; }

typedef struct { int data[MaxSize]; int front, rear; } SqQueue;

void InitQueue(SqQueue *Q) { Q->front = Q->rear = 0; }
int QueueEmpty(SqQueue *Q) { return Q->front == Q->rear; }
int QueueFull(SqQueue *Q) { return (Q->rear + 1) % MaxSize == Q->front; }
int EnQueue(SqQueue *Q, int x) { if (QueueFull(Q)) return 0; Q->data[Q->rear] = x; Q->rear = (Q->rear + 1) % MaxSize; return 1; }
int DeQueue(SqQueue *Q, int *x) { if (QueueEmpty(Q)) return 0; *x = Q->data[Q->front]; Q->front = (Q->front + 1) % MaxSize; return 1; }
```

## 完整代码：括号匹配
```c
int isMatched(const char *s) {
    SqStack S; InitStack(&S);
    for (int i = 0; s[i]; i++) {
        char c = s[i];
        if (c == '(' || c == '[' || c == '{') { Push(&S, c); continue; }
        if (c == ')' || c == ']' || c == '}') {
            int top;
            if (StackEmpty(&S)) return 0;
            Pop(&S, &top);
            if ((c == ')' && top != '(') || (c == ']' && top != '[') || (c == '}' && top != '{')) return 0;
        }
    }
    return StackEmpty(&S);
}
```

## 栈与队列的应用场景
栈用于括号匹配、表达式求值与转换、递归实现、深度优先搜索、函数调用管理、撤销操作。队列用于层次遍历、广度优先搜索、任务调度、缓冲区、打印队列、消息队列。二者都是受限的线性表，限制带来了明确的操作语义。

## 常见易错点
循环队列忘记取模会导致下标越界。判空判满条件必须与具体实现约定一致（是否牺牲单元、是否有 size 或 tag）。链栈通常不带头结点，加入头结点反而增加特判。出栈序列合法性判断要抓住"后进先出"，用栈模拟验证而非凭直觉。

## 本节小结
栈和队列是操作受限的线性表，分别对应后进先出与先进先出两种语义。它们本身结构简单，但作为算法工具被广泛用于表达式处理、遍历和调度。理解循环队列的判空判满、以及栈在递归与括号匹配中的作用，是本章的重点。
