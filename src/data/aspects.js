export default {
    
    knowledge: {
        id: "knowledge",
        icon: "game-icons:open-book",
        name: "Знания",
        attr: "reason",
        opposite: "mystics",
        checks: "order",
        check_icon: "game-icons:materials-science",
        attr_icon: "game-icons:inspiration",
        traits: [
            {
                name: "Образование",
                desc: "",
                levels: [
                    "Получив хорошую обучающую книгу о каком-то навыке, Вы можете научиться его первому уровню, затратив на это не менее месяца времени. Обучение обойдётся Вам в одно очко повышения, если у Вас нет необходимого класса или бесплатно, если он есть. Вы не можете таким образом изучать навыки противоположных аспектов (или их смежные)",
                    "Найдя хорошего мастера навыка (владеющего его третьей ступенью), Вы можете научиться второму уровню. На это Вам и Вашему учителю придётся потратить как минимум месяц времени. Это обойдётся Вам в два очка повышения, если у Вас нет необходимого класса или бесплатно, если он есть. ",
                    "Вы можете обучать других тем навыкам, которыми владеете сами. Вам и Вашему ученику потребуется не менее месяца, а обучаемый так же потратит одно очко повышения за уровень навыка, если у него нет необходимого класса. Вашему ученику не обязательно иметь навык “Образование”. На этом уровне Вы можете обучаться навыкам противоположных аспектов. "
                ]
            }, {
                name: "Живой ум",
                desc: "",
                levels: [
                    "Ваш пытливый ум позволяет Вам быстрее разбираться в любых сферах знаний, которыми владеют разумные. Поиск информации в книгах и библиотеках для Вас на две категории проще. Вы хорошо читаете карты, Вам на одну категорию проще планировать маршрут так, чтобы избежать опасностей или выйти на желаемую точку боевой карты.",
                    "Вы постоянно подмечаете и запоминаете, Ваш разум анализирует и раскладывает по полочкам. Если Вы видите за работой специалиста гражданского профиля на протяжении хотя бы нескольких часов, все Ваши проверки по его профессии впоследствии на одну категорию проще. Если он взялся обучать Вас и на это был затрачен хотя бы один день, проверки на две категории проще. Кроме того, Вы хорошо разбираетесь в общеизвестной истории, в курсе новейших открытий и изобретений.",
                    " Вы знаете и понимаете так много, что зачастую можете дать полезную подсказку даже хорошему специалисту. Если он готов принять Вашу помощь и делится своими планами или соображениями, Вы можете снизить сложность проверки на одну категорию или даже на две, если область знания принадлежит Вашему классу или смежному.",
                ]
            }, {
                name: "В руках мастера",
                desc: "",
                levels: [
                    "Пока для других механизмы - просто инструмент достижения целей, для Вас это ещё и загадка, которую хочется разгадать. Починка механических устройств и обезвреживание механических ловушек с Вашей помощью легче на две категории. Кроме того, Вы можете потратить некоторое время на то, чтобы аккуратно разобрать устройство и понять, как создавать подобные в будущем. Для этого Вам нужно будет пройти проверку, тем более сложную, чем более сложное оборудование Вы разбираете. Это умение не распространяется на магические предметы и артефакты.",
                    "Большой опыт в работе с различными механизмами дал свои плоды - затратив достаточно времени Вы можете сами изобрести некое механическое устройство. Придуманный Вами предмет должен быть принципиально возможным в этом мире и должен опережать технический уровень общества не слишком сильно. Сложность проверки для попытки изобрести нечто определяется мастером. Теперь Вы можете разбирать чтобы изучить и магические предметы, а также Ваш бонус на починку и обезвреживание теперь распространяется и на магические устройства и ловушки. Вы можете создавать простые механические ловушки.",
                    "Теперь Вы можете изобретать и магические устройства и ловушки. Ваше глубокое понимание магии также даёт Вам значительный бонус к заклинаниям - теперь вызов заклинания основным действием всегда работает так, как будто Вы так же затратили один порыв."
                ]
            }, 
        ], 
    },
    society: {
        id: "society",
        icon: "game-icons:human-pyramid",
        name: "Общество",
        opposite: "nature",
        attr: "charisma",
        checks: "impact",
        check_icon: "game-icons:caesar",
        attr_icon: "game-icons:cheerful",
        traits: [
            {
                name: "Всё продаётся",
                desc: "",
                levels: [
                    "Вы тонко чувствуете потребности окружающих и что они готовы отдать за желаемое. Если Вы пытаетесь выяснить мотивацию персонажа или распознать ложь, Ваши проверки на две категории проще (6). Занимаясь любой работой, Вы можете подняться на одну ступень Богатства выше, чем остальные. Скорость набора Богатства, впрочем, остаётся прежней. Если Вы живёте в городе, Ваш уровень Богатства никогда не опускается ниже Среднего (5)",
                    "Продавая добычу после боевого похода Вы можете выручить на две категории больше. Занимаясь любой работой, Вы набираете Богатство вдвое быстрее других.",
                    "Один раз в месяц Вы можете покупать предмет выше своего уровня Богатства на 1 без затрат, либо на 2 уровня, потеряв при этом только один уровень Богатства"
                ]
            }, {
                name: "Прочные связи",
                desc: "",
                levels: [
                    "Большинство окружающих, которым Вы не чинили явного зла, считают Вас как минимум приятелем (Симпатия, 1). Вы знаете как найти выходы на всех влиятельных людей Вашего поселения, а также можете за несколько дней найти общих знакомых с специалистом какой-то профессии, если он есть в Вашем поселении. Вы можете давать взятки на одну категорию меньшие, чтобы добиться того же эффекта.",
                    "Проведя хотя бы три месяца в поселении, Вы обретаете влияние, с которым приходится считаться. Ваши просьбы и угрозы звучат гораздо весомее. Вам также значительно проще искать что-то в обществе - будь это скрывающийся человек или особый товар. Проверки проще на две категории (6). Даже если Вам не удаётся найти искомое, велика вероятность что Вам дадут хотя бы наводку на того, кто может знать ответ. Помогать Вам будут только те силы и фракции, с которыми Вы как минимум не враждуете. Затраты Влияния на значительные услуги снижены на одну категорию.",
                    "Если Вы проводите в поселении хотя бы полгода, Вам удаётся наладить контакт со всеми лидерами фракций (Значительное Влияние, 3) кроме тех что к Вам враждебны. Ваше Влияние на фракции растёт с удвоенной скоростью и никогда не опускается ниже Значительного (3). Когда Вы впервые посещаете поселения, которые активно контактируют с Вашим, Вы сразу получаете преимущества второго уровня этого умения. Преимущества третьего Вы можете получить, проведя в нём месяц. Вам легче внедрять свои задумки в другие фракции, ведь во всех (даже во враждебных) у Вас есть свои люди. Эти проверки проще на две категории.",
                ]
            }, {
                name: "Друг моего друга",
                desc: "",
                levels: [
                    "Имея как минимум Высокое (5) влияние на фракцию, Вы можете попросить их порекомендовать Вас кому-то. При этом Вы потратите два уровня Репутации, но приобретёте один у цели. Для этого Ваша цель должна быть в хороших отношениях с фракцией.",
                    "Вам удаётся поддерживать связь даже со знакомыми в других поселениях и государствах. Вы можете найти знакомого или знакомого знакомого почти в любом крупном поселении. В результате Ваши проверки на Поиск в других поселениях проще на две категории. Кроме того, Вы получаете информацию и новости из далёких земель значительно раньше других.",
                    "Ваш круг знакомых и друзей превращается в настоящую паутину. Ваша Репутация у невраждебных фракций в других поселениях как минимум Неплохая (2), проверки на Порядок и Диверсию проще на категорию. Если Ваш уровень Богатства как минимум Зажиточный (7), проверки становятся проще ещё на одну категорию.",
                ]
            }, 
        ], 
    },
    shadow: {
        id: "shadow",
        icon: "game-icons:cowled",
        name: "Тень",
        attr: "trickery",
        opposite: "war",
        checks: "defence",
        check_icon: "game-icons:hooded-figure",
        attr_icon: "game-icons:domino-mask",
        traits: [
            {
                name: "Хитрый план",
                desc: "",
                levels: [
                    "Один раз в месяц Вы можете добавить облегчить свою проверку социального Влияния, используя свою Хитрость. Сложность снижается на одну категорию за каждые три полные единицы в параметре Хитрость. Есть некая верятность, что местные власти сочтут Ваши действия незаконными.",
                    "Вы можете использовать эту способность два раза в месяц.",
                    "Теперь Вы можете использовать эту способность на проверках Диверсии"
                ]
            }, {
                name: "Военная хитрость",
                desc: "",
                levels: [
                    "Проводя первую атаку по противнику за свой ход, Вы добавляете к броску кость порыва, не затрачивая порыв, если сразу после этого разрываете дистанцию (ближний бой) или скрываетесь из виду (дальний бой).",
                    "Вы учитесь использовать быстрый отскок - затратив один порыв, Вы можете отскочить назад на две клетки. Такое действие не вызывает срабатывания реакций. ",
                    "В бою Вы можете двигаться боком с полной скоростью. Кроме того, если Вы видите как противник пытается атаковать Вас, Вы можете отреагировать за мгновение до этой атаки, если Ваша Защита превосходит его Атаку. Это распространяется даже на дистанционные атаки.",
                ]
            }, {
                name: "Порхай как бабочка",
                desc: "",
                levels: [
                    "Вы научились наносить невероятно точные удары. Максимальное количество костей порыва, которые Вы можете использовать в броске атаки увеличивается до двух.",
                    "Ваша скорость передвижения увеличивается на единицу. Доступное Вам максимальное количество порывов также увеличивается на единицу.",
                    "Идеальный способ обезопасить себя - закончить бой одним невероятно точным ударом. Максимальное количество костей порыва, которые Вы можете использовать в броске атаки увеличивается до трёх.",
                ]
            }, 
        ], 
    },
    mystics: {
        id: "mystics",
        icon: "game-icons:pentacle",
        name: "Мистика",
        attr: "intuition",
        opposite: "knowledge",
        checks: "chaos",
        check_icon: "game-icons:small-fire",
        attr_icon: "game-icons:coiling-curl",
        traits: [
            {
                name: "Духовные практики",
                desc: "",
                levels: [
                    "Вы чувствуете мир иначе чем другие и можете находить связь там где другие её не увидят. Вы можете повысить любую характеристику на 1, пока следуете некоторой духовной практике. Это может быть аскеза, обет, небольшой ежедневный ритуал. Объясните, как эта практика мистически связана с пользой, которую Вы получаете. Вы начинаете получать преимущества когда использовали практику как минимум месяц.",
                    "Вы можете одновременно получать пользу от двух духовных практик направленных на две разные характеристики, или от одной более сложной, повышающей характеристику на 2. В обоих случаях это уже не может быть чем-то небольшим, никак не влияющим на Ваш уровень комфорта.",
                    "Погружаясь в практики всё дальше, Вы можете использовать 3 очков повышения, распределив их как угодно по трём характеристикам, выбирая значения 1, 2 или 3. Такой уровень погружения требует значительных затрат времени и ресурсов, может вызывать непонимание в обществе и иногда создавать значительные проблемы."
                ]
            }, {
                name: "Невозможные знания",
                desc: "",
                levels: [
                    "Иногда Вы просто знаете то, чего никак не могли знать. В боевых ситуациях один раз в день Вы можете задать вопрос, в ответ на который Вам явится подсказка. Вопрос должен касаться того, с чем Вы взаимодействуете или как минимум находитесь на расстоянии нескольких минут движения пешком. Подсказка должна быть правдивой, но не всегда будет точно отвечать на Ваш вопрос, иногда лишь касаться его косвенно.",
                    "Вы научились взывать к таинственному источнику знаний вселенной и вне напряжённых боевых ситуаций. Затратив месяц на поиск и обучение, Вы можете получить навык чужого аспекта или класса по обычной цене, а своего аспекта или класса - на одно очко дешевле. Вы всё ещё не можете изучать противоположные аспекты и их классы.",
                    "Направляя свой взор всё глубже внутрь себя Вы получаете всё больше знаний из таинственного источника. Любая местность для Вас - как минимум Знакомая (3). Теперь Вы можете задавать вопрос мирозданию до трёх раз в боевую сцену или за месяц другой деятельности. Вы можете потратить использование такого вопроса чтобы получить информацию о слабых местах противника, снижая его защиту от Ваших будущих атак на две категории или о слабых местах фракции или организации чтобы облегчить проверки Порядка или Диверсии на две категории",
                ]
            }, {
                name: "Капли одного моря",
                desc: "",
                levels: [
                    "Вы чувствуете необъяснимое родство с другими разумными, даже если Ваши взгляды и цели расходятся. Иногда Вы ощущаете небольшие отблески их мыслей и чувств, и умеете воспользоваться этим себе на пользу. Окружающие оценивают это как удачу, но Вы точно знаете что это навык, доступный немногим. Если на Вашем кубе д12 выпадает 3 или меньше в вопросах связанных с разумными, один раз за боевую сцену или за месяц другой деятельности Вы можете его перебросить.",
                    "Теперь Вы ощущаете подобное родство даже с дикими животными. Количество использований навыка увеличено до двух, а помимо разумных он теперь распространяется на любых живых существ.",
                    " Вы чувствуете мир вокруг как своё продолжение. Всё вокруг - лишь разные узоры на волнах единого моря реальности. Количество использований навыка увеличено до трёх, теперь Вы можете использовать его в любых проверках, в том числе связанных с магией, стихиями, духами и прочим.",
                ]
            }, 
        ], 
    },
    nature: {
        id: "nature",
        icon: "game-icons:curled-leaf",
        name: "Природа",
        attr: "perception",
        opposite: "society",
        checks: "research",
        check_icon: "game-icons:spyglass",
        attr_icon: "game-icons:semi-closed-eye",
        traits: [
            {
                name: "Законы бытия",
                desc: "",
                levels: [
                    "Вы принимаете природу вокруг себя - и она отвечает Вам тем же. Вы можете комфортно жить и выживать в диких условиях, если там вообще могут выживать разумные Вашего вида. На это Вам нужно тратить всё своё время, но вы не нуждаетесь в припасах, добывая их самостоятельно, а Ваше снаряжение почти не ветшает. При этом Вы изучаете данную местность с удвоенной скоростью.",
                    "Вы можете комфортно выживать даже в агрессивных средах, где разумные Вашего вида не живут (пустыни, пещеры и прочее подобное), но не в тех, которые обусловлены магическими эффектами. В обычной дикой местности (такой как лес или степь) Вы теперь можете выживать, практически не тратя на это времени. Скорость освоения местности так же удвоена.",
                    "Глубоко понимая порядки каждой экосистемы, Вы мастерски находите в них место для себя. Вы можете комфортно выживать даже в магических аномалиях, если это вообще возможно для существа с Вашими способностями. Вы должны тратить всё своё время на это только до уровня Изученная (5). Магические аномалии Вы изучаете с обычной скоростью."
                ]
            }, {
                name: "Сбор ингредиентов",
                desc: "",
                levels: [
                    "Если Ваш уровень знания местности хотя бы 5, Вы можете каждый ход выращивать или собирать одну меру качественных немагических ингредиентов, характерных для этой местности, потратив на это всё своё время.",
                    "Вы можете собирать ингредиенты, не затрачивая на это времени, если живёте в этой местности.",
                    "Вы можете собирать качественные магические ингредиенты, в количестве двух мер за один ход, если живёте в этой местности.",
                ]
            }, {
                name: "Как рыба в воде",
                desc: "",
                levels: [
                    "Если Ваш уровень знания местности как минимум 3, Вы получаете дополнительную скорость передвижения в 1 клетку.",
                    "Если Ваш уровень знания местности как минимум 5, Вы можете проходить через сложную местность без дополнительных трат передвижения. Подходящие объекты Вы также можете использовать как укрытия или подспорье в бою",
                    "Если Ваш уровень знания местности как минимум 7, вы получаете дополнительный порыв, а обнаружить Вас сложнее на три категории (9)",
                ]
            }, 
        ], 
    },
    war: {
        id: "war",
        icon: "game-icons:crossed-swords",
        name: "Война",
        attr: "might",
        checks: "attack",
        opposite: "shadow",
        check_icon: "game-icons:arrow-scope",
        attr_icon: "game-icons:embrassed-energy",
        traits: [
            {
                name: "Первый удар",
                desc: "",
                levels: [
                    "Противник не может отреагировать на Ваше передвижение, если Вы атакуете сразу после сближения. Тем не менее, он может отреагировать после.",
                    "Противник, по которому Вы попали после сближения, теряет один порыв прямо перед атакой. Если у него не оставалось порывов, его защита ниже на одну категорию до конца Вашей атаки.",
                    "Противник, которого Вы атакуете сразу после сближения, теряет два порыва и не может отреагировать даже после атаки. Если у него не хватает порывов, он теряет по одной категории защиты за каждый, эффект длится до начала Вашего следующего хода"
                ]
            }, {
                name: "Шквал ударов",
                desc: "",
                levels: [
                    "Потратив два порыва, Вы можете провести одну атаку.",
                    "Потратив два порыва, Вы можете провести одну атаку, при этом Вы добавляете к броску кость порыва.",
                    "В свой ход Вы можете проводить дополнительную атаку, затратив всего одну кость порыва. Кость порыва к броску при этом не добавляется."
                ]
            }, {
                name: "Подавление",
                desc: "",
                levels: [
                    "Ваши атаки мешают противнику действовать, даже если они не попадают по цели. Тот, кого Вы атаковали в свой ход с порывом считается подавленным до конца Вашего следующего хода. Он получает штраф к передвижению в одну клетку, атаке и защите - в одну категорию. Эти штрафы не складываются.",
                    "Противнику приходится тратить всё больше времени и внимания, чтобы бороться с Вашим напором. Каждая атака с порывом по уже подавленному противнику забирает у него один порыв (если он есть), или понижает защиту на две категории вместо одной (если порывы закончились)",
                    "Вы достигли мастерства в подавлении противника. Вам больше не обязательно вкладывать порывы в свои атаки, чтобы подавление сработало."
                ]
            }
        ], 
    },
}