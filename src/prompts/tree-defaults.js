// Author-provided prompt source; rendered values never modify these slots.
const definitions = [
    {
        "nodeId": "task",
        "displayId": "00",
        "label": "固定配图任务",
        "parentId": null,
        "order": 0,
        "kind": "group",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "必须按照以下计划分步骤完成剧情配图任务。\n\n1. 仔细阅读当前剧情，确保理解配图任务。\n2. 每次在正文内出现精彩时刻或关键互动画面时，必须构思指定数量的正文插图，并在对应剧情位置插入绘图 Tag。\n3. 本次正文插图数量为 （数量） 张，以及彩蛋插图 1 张，彩蛋必须生成在 （彩蛋标签） 标记之后。彩蛋插图不计入正文原定张数，全部输出数量为「正文图片数 + 1 张」。（这里`，以及彩蛋插图 1 张，彩蛋必须生成在 （彩蛋标签） 标记之后。彩蛋插图不计入正文原定张数，全部输出数量为「正文图片数 + 1 张」`这些内容在开启了彩蛋后才额外加入）\n4. 必须使用标准 NovelAI 英文画图 Tag，对在场角色进行完全客观的视觉化描写，严禁输出自然语言长句。"
        },
        "children": [],
        "editable": false
    },
    {
        "nodeId": "composition",
        "displayId": "01",
        "label": "画面组成",
        "parentId": null,
        "order": 1,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "【画面构思指南：以“人物关系 + 情绪氛围”为核心】\n\n1. 景别与构图焦点：\n- 根据剧情张力选择明确构图：特写（close-up / face focus）、半身（upper body / cowboy shot）、全身（full body）或双人拉近（close distance / face to face / intimate moment）。\n- 构图重心必须围绕“人物互动与面部情绪交锋”，而非单纯堆砌背景。\n- SFW 画面重点突出人物脸部神态与上半身互动。\n\n2. 镜头视角：\n- 结合剧情氛围选择视角：平视（eye level）、微侧视角（slight side angle）、俯视（from above）、仰视（from below）或第一人称视角（pov）。\n\n3. 人物外貌与体态特征：\n- 聚焦于主要在场角色，根据身份、年龄与设定刻画外貌。\n- 必须明确：发色、发型、发长、瞳色、眼型（如 sharp eyes / tareme）、体型（如 slim / tall / petite / toned / muscular，严格忠于角色原设定，禁止私自篡改；仅在多人设定确实存在明显反差时才添加 height difference / size difference）。\n\n4. 人物表情与视线（需控制权重）：\n- 细化情绪层级与眼神方向（looking at viewer / looking at another / averted gaze）。\n- 常用神态参考：slight smile, gentle smile, shy smile, forced smile, cold expression, soft gaze, longing eyes, half-lidded eyes, parted lips。\n\n5. 服装与身体状态：\n- 仅描写画面中“可见”的服装部位；赤裸部位不写衣物 Tag。\n- 服装需具体（如 white shirt, black coat, loose sweater, school uniform）。\n- 上半身关注手部动作与衣着细节；下半身关注站姿、坐姿、双腿距离与肢体接触。\n- 视剧情追加合理微状态（messy hair, slightly wet, clothes slipping, disheveled, sweat），把控在自然合理的范围内。\n\n6. 人物交互动作：\n- 明确画面中“谁对谁做什么动作”，区分动作的发起方、承受方或双方互做（如 holding hands, hugging, touching face, leaning closer, whispering, looking at each other）。\n\n7. 环境、时间与光影：\n- 画面必须包含明确的背景元素，并与剧情气氛配合（如暧昧剧情配私密空间与柔光）。\n- 地点与陈设参考：bedroom, cafe, classroom, city street, window, curtain, bed, desk。\n- 时间与光影参考：indoor, outdoor, night, sunset, window light, warm lighting, soft lighting, backlighting, cinematic lighting。"
        },
        "children": [
            "egg"
        ]
    },
    {
        "nodeId": "egg",
        "displayId": "01.01",
        "label": "彩蛋任务",
        "parentId": "composition",
        "order": 2,
        "kind": "group",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "【彩蛋画面构思：趣味性与反差感】\n在正文全部图片完成后，于指定的彩蛋标记后额外生成 1 张独立完整的彩蛋图。\n- 画面定位：作为给对话对象的惊喜，风格以搞怪、萌系或微色情/小性感为主。\n- 核心看点：微趣味性 + 反差感 + 角色关系再演绎。\n- 构思方向参考：\n  · IF 线小剧场（角色关系反转 / 性格反转）\n  · Q版互动（Mochi / chibi / super deformed）\n  · 动物化特征（猫塑 kemonomimi / 犬塑 / 抓尾巴 / 小动物行为模式）\n  · 四格或漫画分镜感（4koma / comic strip）\n  · 日常反差崩坏（严肃角色做搞怪行为）\n  · 不仅限于以上举例，可自由拓展\n- 画面必须保留基础背景点缀，且多角色同框时必须统一画风比例（禁止一人 Q 版一人正常比例），保留各角色的标志性发色、瞳色与代表物。"
        },
        "children": [
            "egg.description"
        ],
        "control": "base"
    },
    {
        "nodeId": "egg.description",
        "displayId": "01.01.01",
        "label": "彩蛋解析",
        "parentId": "egg",
        "order": 3,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "在彩蛋图片的 Tag 块输出完成后，紧接着使用以下格式输出彩蛋解析：\n<easter_egg>\n[以本次剧情中任意角色的口吻，用生活化、轻松的语气吐槽或解说本次彩蛋内容。允许使用颜文字与 Meta 元素；换行使用 <br>]\n</easter_egg>"
        },
        "children": []
    },
    {
        "nodeId": "tags",
        "displayId": "02",
        "label": "通用 Tag 规范及补充",
        "parentId": null,
        "order": 4,
        "kind": "group",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {},
        "children": [
            "tags.full",
            "tags.binding",
            "tags.fan",
            "tags.egg"
        ]
    },
    {
        "nodeId": "tags.full",
        "displayId": "02.01",
        "label": "完整角色样貌 Tag",
        "parentId": "tags",
        "order": 5,
        "kind": "text",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "【NovelAI 绘图 Tag 语法规范】\n\n1. 段落结构（单人 vs 多人）：\n- 所有图片的 Tag 都必须完整包裹在 `image###...###` 块内输出。\n- 单人画面：在 `image###...###` 块内直接输出单段 Tag，使用英文逗号 `,` 分隔，不使用管道符 `|`。\n- 多人画面：在 `image###...###` 块内使用单管道符 `|` 分割全局段与各角色专属段（严禁把同一张图的不同角色拆成多个 `image###` 块）：\n  `base prompt | 角色1 prompt | 角色2 prompt`（更多角色依此类推）\n\n2. 全局段（base）与角色段写法：\n- `base prompt`（全局段）：\n  · 类型定性（二选一）：`sfw` 或 `nsfw`\n  · 画面总人数（必须明确）：如 `1girl`、`1boy, 1girl`、`2boys`\n  · 质量与画风基底：`masterpiece, best quality, controlled impasto, soft thick paint, low saturation`\n  · 全局构图与视角：如 `from front, close-up, upper body, full body, pov, eye level`\n  · 背景环境：场景地点 + 时间 + 光照 + 整体氛围\n  · 铁律：严禁在 `base` 段中混入任何个人的外貌、服装或专属动作。\n- `角色 prompt`（角色段）：\n  · 按图片中的位置排序 Tag（默认 Tag 在前出在画面左或上，在后出现在画面右或下），每个角色独占一个 `|` 分段。\n  · 每段开头先写无数字的性别基底（`girl` / `boy` / `other`），随后用英文逗号 `,` 完整写出仅属于该角色的外貌（发色、发型、瞳色、身形）、当下可见服装（款式特征，以及湿身 `wet clothes`、破损 `torn clothes`、脏污 `dirty` 等状态；赤裸部位不写衣物 Tag）、面部表情与个人动作。\n  · 铁律：严禁跨角色段共享外貌或服装特征，严禁使用 GirlA / BoyA 等占位符。\n\n3. 交互动作标记（source# / target# / mutual#）：\n- 普通全局氛围放 `base` 段；多人之间发生明确归属的互动动作（如 `hugging, holding hands, touching face, looking at another`）必须放入各自的角色段内。\n- 在动作发起方的角色段写 `source#动作名`，在动作承受方的角色段写 `target#动作名`；双方互相执行同一动作时，在各自角色段写 `mutual#动作名`。\n- 结构示例：`2boys, sfw, masterpiece, best quality, controlled impasto, night, city street, two-shot, eye level | boy, black hair, short hair, red eyes, tall, black coat, gentle smile, source#holding hands, mutual#looking at another | boy, blonde hair, medium hair, blue eyes, slim, white shirt, shy smile, target#holding hands, mutual#looking at another`\n\n4. 权重与随机语法：\n- 使用 NovelAI 标准权重：`权重数字::tag::`（如 `1.2::tag::`、`0.7::wide eyes::`）或大括号 `{tag}`（加权）、中括号 `[tag]`（降权）。\n- 人物表情权重必须控制在小于 1（如 `0.7::wide eyes::`），以保持角色面部美型。\n- 严禁使用 SD 式的 `(tag:1.2)` 圆括号语法，严禁把整个人物段落用权重括起来。\n- （非必需）可选择使用 NovelAI 随机语法 `||tagA|tagB||`，仅用于剧情未明确限定的镜头角度、光照方式、环境氛围等非关键视觉细节。每组提供 2～3 个合理且互不冲突的选项，按需使用，不必强行加入。禁止随机化角色身份、固定外貌、服装、动作、人物数量、人物关系及剧情已确定的任何信息。随机语法必须完整闭合，不得影响多人角色的 `base | 角色1 | 角色2` 分段结构。\n\n5. 严厉禁止项：\n- 禁止使用自然语言句子或程度副词修饰（如 thoroughly, gravely, heavy, extreme）。\n- 禁止使用抽象主观词或模糊词（如 beautiful, cute, amazing, nice pose, good lighting, glowing, dominant）。\n- 禁止过分繁琐细碎的无效 Tag。"
        },
        "children": [],
        "tagMode": "full"
    },
    {
        "nodeId": "tags.binding",
        "displayId": "02.02",
        "label": "管理角色样貌 Tag",
        "parentId": "tags",
        "order": 6,
        "kind": "text",
        "toggleable": false,
        "defaultEnabled": false,
        "slots": {
            "body": "【NovelAI 绘图 Tag 语法规范】\n\n1. 段落结构（单人 vs 多人）：\n- 所有图片的 Tag 都必须完整包裹在 `image###...###` 块内输出。\n- 只要画面中包含已绑定 ID 的角色（无论单人图还是多人图），都必须在 `image###...###` 块内使用单管道符 `|` 分割全局段与各角色专属段：\n  · 单人已绑定：`base prompt | 角色1 prompt`\n  · 多人画面：`base prompt | 角色1 prompt | 角色2 prompt`（更多角色依此类推）\n\n2. 全局段（base）与角色段写法：\n- `base prompt`（全局段）：\n  · 类型定性（二选一）：`sfw` 或 `nsfw`\n  · 画面总人数（必须明确）：如 `1girl`、`1boy, 1girl`、`2boys`\n  · 质量与画风基底：`masterpiece, best quality, controlled impasto, soft thick paint, low saturation`\n  · 全局构图与视角：如 `from front, close-up, upper body, full body, pov, eye level`\n  · 背景环境：场景地点 + 时间 + 光照 + 整体氛围\n  · 铁律：严禁在 `base` 段中混入任何个人的外貌、服装或专属动作。\n- `角色 prompt`（角色段）：\n  · 按图片中的位置排序 Tag（默认 Tag 在前出在画面左或上，在后出现在画面右或下），每个角色独占一个 `|` 分段。\n  · 【已绑定人物】：在专属角色段的第一个 Tag 位置直接写下方对照表中的指定 ID，并附加英文逗号 `,` 分隔后续 Tag（如 `U01` 或 `C02`），随后接该角色当下的可见服装（款式特征，以及湿身 `wet clothes`、破损 `torn clothes`、脏污 `dirty` 等状态；赤裸部位不写衣物 Tag）、面部表情、发生改变的发型、姿势、交互动作、临时状态（汗水、伤痕）及可见物件。**严禁重复描写已绑定角色的固定发色、默认发型、瞳色与长期体型**。\n  · 【未绑定人物】：不写任何 ID 占位符，在专属角色段开头写无数字的性别基底（`girl` / `boy` / `other`），随后完整写出其发色、发型、瞳色、身形、当下可见服装、面部表情与个人动作。\n  · 铁律：绑定 ID 的角色只选择实际入画的人物输出；每个角色段只能引用一个 ID，同一人物在单个 `image###...###` 块中只出现一次。不知道对应 ID 时不得猜测或捏造，一律按未绑定人物写完整外貌 Tag。严禁使用角色姓名、别名或 GirlA/BoyA 代替 ID，严禁输出 UUID，严禁跨角色段共享服装、表情或动作归属。\n\n3. 交互动作标记（source# / target# / mutual#）：\n- 普通全局氛围放 `base` 段；多人之间发生明确归属的互动动作（如 `hugging, holding hands, touching face, looking at another`）必须放入各自的角色段内。\n- 在动作发起方的角色段写 `source#动作名`，在动作承受方的角色段写 `target#动作名`；双方互相执行同一动作时，在各自角色段写 `mutual#动作名`。\n- 结构示例：`2boys, sfw, masterpiece, best quality, controlled impasto, night, city street, two-shot, eye level | C01, black coat, gentle smile, source#holding hands, mutual#looking at another | U01, white shirt, shy smile, target#holding hands, mutual#looking at another`\n\n4. 权重与随机语法：\n- 使用 NovelAI 标准权重：`权重数字::tag::`（如 `1.2::tag::`、`0.7::wide eyes::`）或大括号 `{tag}`（加权）、中括号 `[tag]`（降权）。\n- 人物表情权重必须控制在小于 1（如 `0.7::wide eyes::`），以保持角色面部美型。\n- 严禁使用 SD 式的 `(tag:1.2)` 圆括号语法，严禁把整个人物段落用权重括起来。\n- （非必需）可选择使用 NovelAI 随机语法 `||tagA|tagB||`，仅用于剧情未明确限定的镜头角度、光照方式、环境氛围等非关键视觉细节。每组提供 2～3 个合理且互不冲突的选项，按需使用，不必强行加入。禁止随机化角色身份、固定外貌、服装、动作、人物数量、人物关系及剧情已确定的任何信息。随机语法必须完整闭合，不得影响多人角色的 `base | 角色1 | 角色2` 分段结构。\n\n5. 严厉禁止项：\n- 禁止使用自然语言句子或程度副词修饰（如 thoroughly, gravely, heavy, extreme）。\n- 禁止使用抽象主观词或模糊词（如 beautiful, cute, amazing, nice pose, good lighting, glowing, dominant）。\n- 禁止过分繁琐细碎的无效 Tag。\n\n【可用绑定 ID 对照表】\n（当前无可用绑定；所有人物须按未绑定规则写完整外貌 Tag，不得输出 ID）"
        },
        "children": [],
        "tagMode": "binding"
    },
    {
        "nodeId": "tags.fan",
        "displayId": "02.02",
        "label": "同人角色补充",
        "parentId": "tags",
        "order": 7,
        "kind": "text",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "【著名 ACGN 同人角色 Tag 补充规则】\n- 当入画角色为知名 ACGN 作品角色（且未分配绑定 ID）时，在该角色的专属段开头（单人图则为人物标签处），禁止使用普通的发色/瞳色基底描写，必须且只能使用加权标准英文名与作品名 Tag：\n  `1.5::english character name::, 1.5::english copyright source::`\n- 严禁描写该同人角色的默认外貌与默认服装（如默认发色、默认瞳色、默认发型、默认原版常服），NovelAI 会通过角色名自动补全默认形象，重复描写反而会导致画面污染。\n- 仅当当前剧情中明确发生了外观变异或换装（如：换穿非默认便服/礼服、湿身 `wet clothes`、战损破衣 `torn clothes`、散发或改变默认发型）时，才在同人角色名后追加对应的变异/换装 Tag。"
        },
        "children": [],
        "flag": "fan"
    },
    {
        "nodeId": "tags.egg",
        "displayId": "02.03",
        "label": "彩蛋 Tag 规范",
        "parentId": "tags",
        "order": 8,
        "kind": "text",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "【彩蛋插图专属 Tag 规范】\n- 彩蛋图的段落结构、多人 `|` 管道符分割、角色特征归属规则与正文图片完全一致。\n- 风格定位：倾向日系萌感与轻松喜剧氛围，严禁出现欧美卡通画风（如人头动物、过度夸张的颜艺或 goofy smile）。\n- 推荐在彩蛋图的 `base` 段追加风格与氛围 Tag：\n  · 风格类：`chibi, super deformed, mochi, comic style, 4koma, flat color, clean lines`（根据构思选配）\n  · 氛围类：`lighthearted, comedic contrast`\n- 推荐在角色段使用的强互动趣味动作 Tag：\n  `chasing, poking, cheek poking, pulling clothes, sitting on head, holding tail, biting ear`"
        },
        "children": [],
        "condition": [
            "egg"
        ]
    },
    {
        "nodeId": "nsfw",
        "displayId": "03",
        "label": "NSFW 规范",
        "parentId": null,
        "order": 9,
        "kind": "group",
        "toggleable": true,
        "defaultEnabled": false,
        "slots": {
            "body": "【NSFW 色情画面构思与 Tag 规范】\n1. 构图与焦点：\n- 生成 NSFW 图片时，严禁回避直面色情画面。基础标签需使用 `nsfw`。\n- 画面焦点必须直接对准交合部位、性器官特写（penis, pussy, clitoris, uterus/x-ray 视情况选配）以及角色的官能表情。\n- 准确还原双方真实的身体特征（如 breasts 尺寸形态、原设定身形）与动作张力；仅当双方原设定确实存在明显体型或年龄反差时才体现 size difference，严禁为了色情张力私自将正常/纤细体型篡改为 tall, muscular 等。\n\n2. 角色状态与细节渲染：\n- 重点刻画承受方的失神/快感表情与进攻方的性器状态。\n- 积极调用情欲细节 Tag 增强官能感：`sweat, heavy breathing, blush, rolling eyes, ahegao, tongue out, saliva, pussy juice, trembling,arched back`。\n- 准确描述性行为中角色的性器官状态及性玩具（sex toys, vibrator, dildo 等）的具体交互方式。\n- 多人 NSFW 同样严格遵守 `base | 角色1 | 角色2` 管道符协议，利用 `source#`（进攻方/施予方）与 `target#`（承受方）明确性交体位与动作归属。\n\n3. NSFW 禁止项：\n- 严禁为性器官添加任何颜色修饰 Tag（如 purple penis 等会导致画面色彩崩坏的词）。\n- 严禁使用含糊不清的动作词，体位与插入状态必须使用精准的 Danbooru / NAI 标准 Tag。\n- 严禁出现违背人体生理学、破坏美感的极端畸形比例（如 `huge penis, hyper` 等）。"
        },
        "children": [
            "orientation"
        ]
    },
    {
        "nodeId": "orientation",
        "displayId": "03.02",
        "label": "性向选择",
        "parentId": "nsfw",
        "order": 10,
        "kind": "choice-group",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {},
        "children": [
            "orientation.bg",
            "orientation.bl",
            "orientation.gl",
            "orientation.intersex"
        ]
    },
    {
        "nodeId": "orientation.bg",
        "displayId": "03.02.BG",
        "label": "BG",
        "parentId": "orientation",
        "order": 11,
        "kind": "choice-option",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "- 注意本次NSFW为[bg]，即在描绘NSFW环节中，精准突出bottom方的子宫/阴唇/穴口，top方的睾丸/阴茎等。"
        },
        "children": [],
        "choice": "BG"
    },
    {
        "nodeId": "orientation.bl",
        "displayId": "03.02.BL",
        "label": "BL",
        "parentId": "orientation",
        "order": 12,
        "kind": "choice-option",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "- 注意本次NSFW为[bl]，即在描绘NSFW环节中，精准突出bottom方的肛门/尻穴，但是不要遗漏了bottom方存在的阴茎，top方的睾丸/阴茎等。"
        },
        "children": [],
        "choice": "BL"
    },
    {
        "nodeId": "orientation.gl",
        "displayId": "03.02.GL",
        "label": "GL",
        "parentId": "orientation",
        "order": 13,
        "kind": "choice-option",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "- 注意本次NSFW为[gl]，即在描绘NSFW环节中，精准突出bottom方的子宫/阴唇/穴口，top方的花穴等。如果有性爱道具的话也必须注意。"
        },
        "children": [],
        "choice": "GL"
    },
    {
        "nodeId": "orientation.intersex",
        "displayId": "03.02.INTERSEX",
        "label": "双性",
        "parentId": "orientation",
        "order": 14,
        "kind": "choice-option",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "- 注意本次NSFW中，明确起码有一方为双性，要精准突出bottom方的肛门/尻穴/花穴/阴唇，不要遗漏了性交中，双性方存在两性特征，阴茎或者小穴。"
        },
        "children": [],
        "choice": "INTERSEX"
    },
    {
        "nodeId": "selfcheck",
        "displayId": "04",
        "label": "自检",
        "parentId": null,
        "order": 15,
        "kind": "group",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "prefix": "每次准备生成配图前，必须先在 `<imgthink>` 标签内按照以下检查点逐项进行详细自检，不得遗漏；多个精彩画面应分别独立执行 `<imgthink>` 与配图输出。\n在正文开始前的第一行，必须先原样输出一次以下注释：\n<!-- 必须在content内进行imgthink进行思考 -->\n\n<imgthink>",
            "suffix": "</imgthink>"
        },
        "children": [
            "selfcheck.item1",
            "selfcheck.item2",
            "selfcheck.egg",
            "selfcheck.fan",
            "selfcheck.roles.full",
            "selfcheck.roles.binding",
            "selfcheck.item4",
            "selfcheck.nsfw",
            "selfcheck.item5"
        ]
    },
    {
        "nodeId": "selfcheck.item1",
        "displayId": "04.01",
        "label": "画面与构图",
        "parentId": "selfcheck",
        "order": 16,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "【画面与构图】\n- 当前为第几张图？后续还应生成几张配图？\n- 本图定格了剧情中的哪个具体瞬间？如何明确镜头视角、人物距离与前后景层次？如何将构图重心聚焦在人物面部情绪与肢体互动上？"
        },
        "children": []
    },
    {
        "nodeId": "selfcheck.item2",
        "displayId": "04.02",
        "label": "Tag 规范",
        "parentId": "selfcheck",
        "order": 17,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "【Tag 基础语法】\n- 画面中的情绪与光影如何转化为具体可视觉化的英文 Tag（如将笼统的 `smile` 细化为 `gentle smile / smirk`）？\n- 构思本图时，应主动避开哪些抽象废词与程度副词？"
        },
        "children": []
    },
    {
        "nodeId": "selfcheck.egg",
        "displayId": "04.EGG",
        "label": "彩蛋额外检查",
        "parentId": "selfcheck",
        "order": 18,
        "kind": "text",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "【彩蛋小剧场构思】\n- 构思正文配图时直接跳过本条；仅在规定标记后生成彩蛋图时详细思考：\n- 创意企划：结合刚才的正文剧情，本次彩蛋适合采用哪种趣味形式？（例如：关系/性格反转的 IF 线、软萌 Q 版互动、猫塑/犬塑动物化、四格漫画分镜，还是严肃角色的日常反差崩坏？）\n- 画风与媒介选定：本图在保持萌感与美观的前提下，采用哪种统一画风？（例如：糯米团子风 `mochi, chibi, super deformed`、日系四格条漫 `4koma, comic style, flat color, clean lines`，或带一点美式卡通张力但保持日系萌感的画风？切忌出现人头兽身或画风比例混搭）。\n- 趣味动作：角色之间具体在做什么高互动的搞怪/亲昵动作（如 `poking, chasing, holding tail, biting ear`）？"
        },
        "children": [],
        "condition": [
            "selfcheck",
            "egg"
        ]
    },
    {
        "nodeId": "selfcheck.fan",
        "displayId": "04.04",
        "label": "同人角色思考",
        "parentId": "selfcheck",
        "order": 19,
        "kind": "text",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "【ACGN 同人角色】\n- 入画人物中是否包含未绑定 ID 的著名 ACGN 角色？若有，其标准英文名与作品名加权 Tag（`1.5::角色英文名::, 1.5::作品英文名::`）具体是什么？\n- 剔除该同人角色的默认发色、瞳色与默认原版常服后，当前剧情是否有需要额外追加的外观变异或换装 Tag（如换穿便服、湿身 `wet clothes`、战损 `torn clothes`）？"
        },
        "children": [],
        "flag": "fan"
    },
    {
        "nodeId": "selfcheck.roles.full",
        "displayId": "04.05A",
        "label": "角色刻画与分段归属 · 完整",
        "parentId": "selfcheck",
        "order": 20,
        "kind": "text",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "【角色刻画与分段归属】\n- 本图实际入画的角色有哪些？本图是单人（单段无 `|`）还是多人（`base | 角色1 | 角色2`）？`base` 段中的总人数 Tag（如 `1boy, 1girl`）具体写什么，以及后方 `|` 角色分段对应的数量是？\n- 每个入画角色专属段内的：性别基底（`boy / girl / other`）、完整外貌（发色、发型、瞳色、身形）以及当下可见服装（款式特征及湿身/破损状态；赤裸部位不写衣物）。\n- 确认 `base` 段仅保留环境、光照与全局构图，所有个人的外貌、服装与动作均已严格放入各自的角色段内，无跨段污染。"
        },
        "children": [],
        "tagMode": "full"
    },
    {
        "nodeId": "selfcheck.roles.binding",
        "displayId": "04.05B",
        "label": "角色刻画与分段归属 · 管理",
        "parentId": "selfcheck",
        "order": 21,
        "kind": "text",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "【角色刻画与分段归属】\n- 本图实际入画的角色有哪些？`base` 段中的总人数 Tag（如 `1girl` 或 `1boy, 1girl`）具体写什么，以及后方 `|` 角色分段对应的数量是？\n- 已绑定 ID 人物：其角色段开头应填入对照表中的哪个指定 ID（如 C01/U01）？当下需要为其补充哪些可见服装（含湿身/破损状态）、面部表情与动作 Tag？（注意严格省略其固定发色、发型、瞳色与长期体型）。\n- 若存在未绑定人物：其角色段如何用 `boy / girl / other` 完整构建发色、发型、瞳色、身形与可见服装？\n- 确认 `base` 段仅保留环境、光照与全局构图，各角色特征均归属在各自段内，无跨段污染。"
        },
        "children": [],
        "tagMode": "binding"
    },
    {
        "nodeId": "selfcheck.item4",
        "displayId": "04.06",
        "label": "多人交互逻辑思考",
        "parentId": "selfcheck",
        "order": 22,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "【多人交互逻辑】\n- 单人画面直接跳过本条。\n- 核对双方原设定体态：入画角色各自真实的身高与体型 Tag 是什么？仅当双方设定确实存在明显悬殊时，才添加 `height difference / size difference`；若双方身高相仿（如均为 tall 或均为 short）或体型相近（如均为 slim 或均为 toned），则不写任何差异词，严禁无中生有。\n- 此次互动中，谁是动作发起方、谁是承受方（或双方互做）？`source#动作名`、`target#动作名` 或 `mutual#动作名` 应分别写入哪几个角色段内？"
        },
        "children": []
    },
    {
        "nodeId": "selfcheck.nsfw",
        "displayId": "04.07",
        "label": "NSFW 专项思考",
        "parentId": "selfcheck",
        "order": 23,
        "kind": "text",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "【NSFW 画面构思】\n- 非 NSFW 画面时直接跳过本条。\n- 如何将镜头焦点直面交合部位与性器官特写（具体选用哪些体位与性器 Tag）？\n- 承受方的情欲失神状态（如 `sweat, heavy breathing, blush, rolling eyes, tongue out, saliva, pussy juice`）与进攻方的动作细节分别用哪些 Tag 刻画？\n- 严守真实体型设定：交合双方各自的真实身材是什么？严禁为了迎合“色情画面张力”或刻板印象而私自篡改角色体型（例如：严禁把原本正常/纤细体型的角色强行加上 `tall, muscular, large breasts` 等不符合原设定的词）。\n- 若涉及性玩具，具体使用哪个精准 Tag？同时注意严格避开性器官颜色修饰词（如 purple penis, pink pussy）及违背生理学的畸形比例（如 huge penis）。"
        },
        "children": [],
        "condition": [
            "nsfw"
        ]
    },
    {
        "nodeId": "selfcheck.item5",
        "displayId": "04.08",
        "label": "权重与美型控制思考",
        "parentId": "selfcheck",
        "order": 24,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": true,
        "slots": {
            "body": "【权重与美型控制】\n- 本图有哪些核心元素需要用 NovelAI 的 `数字::tag::` 或 `{}` / `[]` 语法微调权重（注意严禁使用 SD 的 `()` 圆括号）？\n- 人物的面部表情 Tag 计划赋予多少的降权数值（须小于 1，如 `0.7::wide eyes::`）以维持面部美型？注意剔除极端大笑、黑眼圈、驼背等破坏美感的畸形 Tag。"
        },
        "children": []
    },
    {
        "nodeId": "output",
        "displayId": "05",
        "label": "输出要求",
        "parentId": null,
        "order": 25,
        "kind": "group",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "prefix": "【每个配图的正确完整格式】"
        },
        "children": [
            "output.selfcheck",
            "output.subtitle",
            "output.format"
        ]
    },
    {
        "nodeId": "output.selfcheck",
        "displayId": "05.01",
        "label": "自检输出规则",
        "parentId": "output",
        "order": 26,
        "kind": "text",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "<imgthink>\n与当前画面对应的思考过程。\n</imgthink>"
        },
        "children": [],
        "condition": [
            "selfcheck"
        ]
    },
    {
        "nodeId": "output.subtitle",
        "displayId": "05.02",
        "label": "小标题",
        "parentId": "output",
        "order": 27,
        "kind": "text",
        "toggleable": true,
        "defaultEnabled": false,
        "slots": {
            "body": "┈┈[胡里花哨的符号+本次绘画的主题文字+可爱颜文字]┈┈"
        },
        "children": []
    },
    {
        "nodeId": "output.format",
        "displayId": "05.03",
        "label": "图片标签结构",
        "parentId": "output",
        "order": 28,
        "kind": "text",
        "toggleable": false,
        "defaultEnabled": true,
        "slots": {
            "body": "image###\n[图片tag]\n###"
        },
        "children": []
    }
];
function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
}
export const promptTree = freeze(definitions);
export const treeById = freeze(Object.fromEntries(promptTree.map(node => [node.nodeId, node])));
export const treeRoots = freeze(promptTree.filter(node => node.parentId === null).map(node => node.nodeId));
export const orientations = Object.freeze(['', 'BG', 'BL', 'GL', 'INTERSEX']);

export function validatePromptTree(nodes = promptTree) {
    const byId = new Map(nodes.map(node => [node.nodeId, node]));
    if (byId.size !== nodes.length) throw Error('提示词节点 ID 重复');
    const roots = nodes.filter(node => node.parentId === null);
    if (roots.map(node => node.displayId).join(',') !== '00,01,02,03,04,05') throw Error('提示词一级顺序错误');
    for (const node of nodes) {
        let current = node, depth = 1;
        const seen = new Set([node.nodeId]);
        while (current.parentId !== null) {
            const parent = byId.get(current.parentId);
            if (!parent || seen.has(parent.nodeId)) throw Error('提示词父级不存在或存在循环');
            if (!parent.children.includes(current.nodeId) || ++depth > 3) throw Error('提示词层级错误');
            seen.add(parent.nodeId); current = parent;
        }
        if (new Set(node.children).size !== node.children.length || node.children.some(id => byId.get(id)?.parentId !== node.nodeId)) throw Error('提示词子项错误');
        if (node.condition && (!Array.isArray(node.condition) || node.condition.some(id => !byId.has(id)))) throw Error('提示词条件错误');
        if (node.kind === 'choice-option' && (!orientations.includes(node.choice) || node.toggleable)) throw Error('提示词选择器错误');
    }
    const visiting = new Set(), visited = new Set();
    function visit(id) {
        if (visiting.has(id)) throw Error('提示词条件依赖循环');
        if (visited.has(id)) return;
        visiting.add(id);
        const node = byId.get(id);
        for (const dependency of [node.parentId, ...(node.condition || [])].filter(Boolean)) visit(dependency);
        visiting.delete(id); visited.add(id);
    }
    nodes.forEach(node => visit(node.nodeId));
    return true;
}
validatePromptTree();
