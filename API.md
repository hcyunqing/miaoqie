---
title: 默认模块
language_tabs:
  - shell: Shell
  - http: HTTP
  - javascript: JavaScript
  - ruby: Ruby
  - python: Python
  - php: PHP
  - java: Java
  - go: Go
toc_footers: []
includes: []
search: true
code_clipboard: true
highlight_theme: darkula
headingLevel: 2
generator: "@tarslib/widdershins v4.0.30"

---

# 默认模块

Base URLs:

# Authentication

# Default

## POST 获取用户信息

POST /cloudide/api/v3/trae/GetUserInfo

### 请求参数

|名称|位置|类型|必选|说明|
|---|---|---|---|---|
|Cookie|header|string| 否 |none|
|Origin|header|string| 否 |none|
|Traceparent|header|string| 否 |none|

> 返回示例

> 200 Response

```json
{
    "ResponseMetadata": {
        "RequestId": "",
        "TraceID": "20260625001722D69F36AE83A3C024056C",
        "Action": "GetUserToken",
        "Version": "",
        "Source": "",
        "Service": "",
        "Region": "",
        "WID": null,
        "OID": null
    },
    "Result": {
        "Token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiNTA4NDQ0NjE0MzQzMTEzIiwic291cmNlIjoic2Vzc2lvbiIsInNvdXJjZV9pZCI6InFfN082SXBibEFXYTRhMnB1a2JjdmJlX2h5TlZNd1p3dWkxV0hnS0w4Y2M9LjE4YmMwZGRkMWFjNzFhMTciLCJ0ZW5hbnRfaWQiOiI3bzJkODk0cDdkcjBvNCIsInR5cGUiOiJ1c2VyIn0sImV4cCI6MTc4MjM0NjY0MiwiaWF0IjoxNzgyMzE3ODQyfQ.EfJP_HI6XZVRWl8e7KYuMygK-9BCLbqM2NAg0gOBOJy0GT9-uIY_nJC41-LpVORhbSR2s7hCuaHErZMETCIQ6TZUIDpXi1rE92RSSMFxnxyUJdYry75xQHhNWt3I1-UBZhAFqV13lHwwY6WeCVqtleRXmgvcMFuXF8NTi9brCrJof-Lc_1EfsH9qws2AFRVRbHJd9kkGjOr9LJEtZcF5aw6f_yGmskM5fEHmbycighhaC-Gjm16XE1KaA1GBPk0dTJLoEepMFaBNgwUEhrQvf1vFYNWa34aZ9mqNAMNnqA24IrUz8DZlqqvvTD5AjhNdIpZWY7-Lz32yAWlVBHFU7ijpU1eh85XWxG68OagEWIsbYwqZzjOW8zGfYQUHsbpJmAH_Xg9M1bV7xyW0lq1bEs1a4oCRkmC3mx02NPgWjsMoZBbxq-v1Ywpjlk6p8fOAcOu2iugD-PQV9QyA_-mqhI5FIEQYBbqyhtWPbUnynSVIYxYjGYAL89uhuyUcQCKSR4H6s8vt0zeR8mEwC9B9Jx6hSLVcIFdLYDPD0YsSU5KQIyj4IZnkuSe2pxAyN_efKHFG5QLGq5Zn8kXMyTjNe8yQjFwpTNy4aWKMhR3A51ATEjiuFbV3QfhySbjstNLM3EW5oBI7o8u8WIMPxcUx-YbTZi9fSEt-1tkP65OMFd8",
        "ExpiredAt": "2026-06-25T08:17:22.738939855+08:00",
        "UserID": "508444614343113",
        "TenantID": "7o2d894p7dr0o4"
    }
}
```

### 返回结果

|状态码|状态码含义|说明|数据模型|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|

### 返回数据结构

## POST 获取用户token

POST /cloudide/api/v3/common/GetUserToken

### 请求参数

|名称|位置|类型|必选|说明|
|---|---|---|---|---|
|Cookie|header|string| 否 |none|
|Origin|header|string| 否 |none|
|Traceparent|header|string| 否 |none|

> 返回示例

> 200 Response

```json
{
    "ResponseMetadata": {
        "RequestId": "",
        "TraceID": "202606250017580E363BE21BC94E3A67EC",
        "Action": "GetUserToken",
        "Version": "",
        "Source": "",
        "Service": "",
        "Region": "",
        "WID": null,
        "OID": null
    },
    "Result": {
        "Token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiNTA4NDQ0NjE0MzQzMTEzIiwic291cmNlIjoic2Vzc2lvbiIsInNvdXJjZV9pZCI6InFfN082SXBibEFXYTRhMnB1a2JjdmJlX2h5TlZNd1p3dWkxV0hnS0w4Y2M9LjE4YmMwZGRkMWFjNzFhMTciLCJ0ZW5hbnRfaWQiOiI3bzJkODk0cDdkcjBvNCIsInR5cGUiOiJ1c2VyIn0sImV4cCI6MTc4MjM0NjY3OCwiaWF0IjoxNzgyMzE3ODc4fQ.rQpXrqrvkp7HHVTXr-D02LW1dVO7jcXZKAMH49SYjWoGX1VauseHKdrgtOJASmtUhz1MNSce0QjD7lwxQkIANozcV7cyDDZTU28m0AMk1wQmkiRNsuL_M1knSEZq1kgi8qRinHxq4WW5sc3k7oTpeFf5raCEv2llmM2Vpvth57ylw_YIm8sJE_Y8FtbeMRMscjgqq6cdQ7H5-zSbgVZUclngGRsHQ8_ZCYAXku3EaD5WL9X4T0dxV0r09klMo23_PNai1eHAzjMd091MQxqpslrEQBTSZCDinoMEbZTDp-soWibR5RLV5Ywix9xD6vZJpUTO7h1-4P19xueQUwz3Y0zbZL0h8SBOKsMFU5l9JBlIUqdK-vRlN9E-C_f5nFEITjVCT4FVMelyRBAhtSHk60BnYylLuovcNK_089hg3VDFxLsqhf5ZY3wie6juQi6v8tVu0OKbCNd_o2VGSw51R5pj2B__2oUuoTQc8h18rZxrc_3uHITI2MIin8xqHIqY-xD53jHGAxxAL8Bdf6qFOWS_WwS4BbZSWq_5vvfkuGMTHt7wsD0Hy2rEqzVfS-abyR84juMREtKCZOpyb4ZdunWtTbmi5Scr_AeW0_LXMSoUQ1gpZrmlpc-u2BW8HHHMS-r3w7naNHct248pWC2GWG6m63pBFzLJLFx7gHenu8Y",
        "ExpiredAt": "2026-06-25T08:17:58.078967537+08:00",
        "UserID": "508444614343113",
        "TenantID": "7o2d894p7dr0o4"
    }
}
```

### 返回结果

|状态码|状态码含义|说明|数据模型|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|none|Inline|

### 返回数据结构

# 数据模型

<h2 id="tocS_Pet">Pet</h2>

<a id="schemapet"></a>
<a id="schema_Pet"></a>
<a id="tocSpet"></a>
<a id="tocspet"></a>

```json
{
  "id": 1,
  "category": {
    "id": 1,
    "name": "string"
  },
  "name": "doggie",
  "photoUrls": [
    "string"
  ],
  "tags": [
    {
      "id": 1,
      "name": "string"
    }
  ],
  "status": "available"
}

```

### 属性

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|id|integer(int64)|true|none||宠物ID编号|
|category|[Category](#schemacategory)|true|none||分组|
|name|string|true|none||名称|
|photoUrls|[string]|true|none||照片URL|
|tags|[[Tag](#schematag)]|true|none||标签|
|status|string|true|none||宠物销售状态|

#### 枚举值

|属性|值|
|---|---|
|status|available|
|status|pending|
|status|sold|

<h2 id="tocS_Category">Category</h2>

<a id="schemacategory"></a>
<a id="schema_Category"></a>
<a id="tocScategory"></a>
<a id="tocscategory"></a>

```json
{
  "id": 1,
  "name": "string"
}

```

### 属性

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|id|integer(int64)|false|none||分组ID编号|
|name|string|false|none||分组名称|

<h2 id="tocS_Tag">Tag</h2>

<a id="schematag"></a>
<a id="schema_Tag"></a>
<a id="tocStag"></a>
<a id="tocstag"></a>

```json
{
  "id": 1,
  "name": "string"
}

```

### 属性

|名称|类型|必选|约束|中文名|说明|
|---|---|---|---|---|---|
|id|integer(int64)|false|none||标签ID编号|
|name|string|false|none||标签名称|

