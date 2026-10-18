package com.brainlessmusic.app.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * Ring's icons (A130): MingCute 3.0.2, the Regular (line) set, soft and round like maimai's buttons; play, pause, a
 * liked heart and the skip arrows use the Filled set, to sit solid on the lit buttons. Apache License 2.0, by
 * Richard9394 (MingCute Design); credited in Settings → Licenses. Generated from the SVGs (24-unit, 2-unit strokes).
 */
object RingIcons {
    val Play: ImageVector by lazy { mingcute("Play", solid("M5.669 4.76a1.47 1.47 0 0 1 2.04-1.177c1.062.453 3.442 1.532 6.462 3.276 3.021 1.744 5.146 3.266 6.069 3.958.788.59.79 1.763.001 2.355-.914.687-3.013 2.191-6.07 3.956-3.06 1.766-5.412 2.832-6.464 3.28a1.467 1.467 0 0 1-2.038-1.177c-.138-1.141-.396-3.734-.396-7.236 0-3.5.257-6.092.396-7.235", evenOdd = true)) }
    val Back: ImageVector by lazy { mingcute("Back", line("M14.657 17.657 9 12l5.657-5.657", 2f, ROUND, ROUND_JOIN)) }
    val Shuffle: ImageVector by lazy { mingcute("Shuffle", line("M4 6h1.528a4 4 0 0 1 3.578 2.211L11 12m0 0 1.894 3.789A4 4 0 0 0 16.472 18h1.357M11 12l-1.894 3.789A4 4 0 0 1 5.528 18H4m7-6 1.886-3.773a4 4 0 0 1 3.604-2.211l1.34.008", 2f, ROUND, MITER_JOIN), solid("M17.578 3.654c-.28-.146-.604.065-.631.411a25 25 0 0 0-.073 1.93c0 .848.04 1.538.078 1.996.027.324.323.503.598.36.368-.192.906-.492 1.55-.91a20 20 0 0 0 1.476-1.056c.248-.196.259-.574.023-.762a19 19 0 0 0-1.498-1.074 19 19 0 0 0-1.523-.895m0 12c-.28-.146-.604.065-.631.411a25 25 0 0 0-.073 1.93c0 .848.04 1.538.078 1.996.027.324.323.503.598.36.368-.192.906-.492 1.55-.91a20 20 0 0 0 1.476-1.056c.248-.196.259-.574.023-.762a19 19 0 0 0-1.498-1.074 19 19 0 0 0-1.523-.895")) }
    val Download: ImageVector by lazy { mingcute("Download", solid("M13 3a1 1 0 1 0-2 0zm-2 13a1 1 0 1 0 2 0zm-1.828-4a1 1 0 1 0-1.415 1.414l.707-.707zM12 16.243l-.707.707a1 1 0 0 0 1.414 0zm4.243-2.829A1 1 0 1 0 14.828 12l.708.707zM20 7h-1v13h2V7zm-1 14v-1H5v2h14zM4 20h1V7H3v13zM5 6v1h3V5H5zm11 0v1h3V5h-3zm-4-3h-1v13h2V3zm-3.536 9.707-.707.707 3.536 3.536.707-.707.707-.707L9.172 12zM12 16.243l.707.707 3.536-3.536-.707-.707-.708-.707-3.535 3.536zM4 7h1V5a2 2 0 0 0-2 2zm1 14v-1H3a2 2 0 0 0 2 2zm15-1h-1v2a2 2 0 0 0 2-2zm0-13h1a2 2 0 0 0-2-2v2z")) }
    val Search: ImageVector by lazy { mingcute("Search", line("m15.879 15.879 4.242 4.242M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z", 2f, ROUND, MITER_JOIN)) }
    val Pause: ImageVector by lazy { mingcute("Pause", solid("M14 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1zM6 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z")) }
    val CircleCheck: ImageVector by lazy { mingcute("CircleCheck", solid("M8.464 11.21a1 1 0 0 0-1.414 1.414l.707-.707zm2.122 3.535-.707.707a1 1 0 0 0 1.414 0zm6.364-4.95a1 1 0 0 0-1.415-1.414l.707.707zM21 12h-1a8 8 0 0 1-8 8v2c5.523 0 10-4.477 10-10zm-9 9v-1a8 8 0 0 1-8-8H2c0 5.523 4.477 10 10 10zm-9-9h1a8 8 0 0 1 8-8V2C6.477 2 2 6.477 2 12zm9-9v1a8 8 0 0 1 8 8h2c0-5.523-4.477-10-10-10zm-4.243 8.917-.707.707 2.829 2.828.707-.707.707-.707-2.829-2.828zm2.829 2.828.707.707 5.657-5.657-.707-.707-.708-.707-5.656 5.657z")) }
    val More: ImageVector by lazy { mingcute("More", solid("M12 12.5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1m0 6a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1m0-12a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1"), line("M12 12.5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1Zm0 6a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1Zm0-12a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1Z", 2f, BUTT, MITER_JOIN)) }
    val Heart: ImageVector by lazy { mingcute("Heart", solid("M18.494 3.801c2.095 1.22 3.569 3.7 3.504 6.592C21.86 16.5 13.5 21 12 21s-9.861-4.5-9.998-10.607C1.937 7.5 3.411 5.022 5.506 3.8c1.96-1.142 4.422-1.148 6.494.537 2.072-1.685 4.534-1.679 6.494-.537")) }
    val HeartOutline: ImageVector by lazy { mingcute("HeartOutline", line("M12 5.705c-3.692-3.947-9.114-.478-8.998 4.666q.102 4.59 7.19 8.8c.274.163.706.41 1.08.62a1.48 1.48 0 0 0 1.457 0c.373-.21.805-.457 1.08-.62q7.085-4.21 7.19-8.8c.115-5.144-5.307-8.613-8.999-4.666Z", 2f, BUTT, ROUND_JOIN)) }
    val Queue: ImageVector by lazy { mingcute("Queue", line("M4 18h4m-4-6h6M4 6h9m4 11.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0m0 0V5l3 1", 2f, ROUND, ROUND_JOIN)) }
    val Previous: ImageVector by lazy { mingcute("Previous", solid("M20.43 5.863A1.332 1.332 0 0 0 18.583 4.8c-.848.36-2.88 1.271-5.479 2.771s-4.405 2.806-5.14 3.36a1.332 1.332 0 0 0 0 2.13c.728.55 2.51 1.838 5.141 3.357s4.639 2.419 5.48 2.775a1.332 1.332 0 0 0 1.843-1.065c.113-.911.341-3.12.341-6.133 0-3.01-.228-5.218-.34-6.13M5 5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z")) }
    val Next: ImageVector by lazy { mingcute("Next", solid("M3.569 5.863A1.332 1.332 0 0 1 5.414 4.8c.848.36 2.88 1.271 5.479 2.771s4.404 2.806 5.14 3.36c.71.536.71 1.594 0 2.13-.728.55-2.51 1.838-5.141 3.357s-4.639 2.419-5.48 2.775a1.332 1.332 0 0 1-1.843-1.065c-.113-.911-.341-3.12-.341-6.133 0-3.01.228-5.218.34-6.13M19 5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z")) }
    val Error: ImageVector by lazy { mingcute("Error", line("M12 7v6m0 3h.002M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", 2f, ROUND, MITER_JOIN)) }
    val CircleDown: ImageVector by lazy { mingcute("CircleDown", line("M15.535 12.712 12 16.247l-3.536-3.535M12 16.242V7.758M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0", 2f, ROUND, ROUND_JOIN)) }
    val Close: ImageVector by lazy { mingcute("Close", line("m5.636 5.637 12.728 12.728m-12.728 0L18.364 5.637", 2f, ROUND, MITER_JOIN)) }
    val Disc: ImageVector by lazy { mingcute("Disc", line("M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm0 0V3.512M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", 2f, ROUND, MITER_JOIN)) }
    val TrendDown: ImageVector by lazy { mingcute("TrendDown", line("m3 8 6.5 6.5L14 10l6.5 6.5M17 17h4v-4", 2f, ROUND, ROUND_JOIN)) }
    val AddToList: ImageVector by lazy { mingcute("AddToList", line("M18 11V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14.066a.5.5 0 0 0 .777.416l4.946-3.297a.5.5 0 0 1 .554 0l.723.482M19 16v6m-3-3h6", 2f, ROUND, ROUND_JOIN)) }
    val User: ImageVector by lazy { mingcute("User", line("M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm4 13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-1a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4z", 2f, BUTT, MITER_JOIN)) }
    val Music: ImageVector by lazy { mingcute("Music", line("M20 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm0 0V5.18a1 1 0 0 0-1.164-.986l-10 1.667A1 1 0 0 0 8 6.847V18.5m0 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM20 8 8 10", 2f, BUTT, MITER_JOIN)) }
    val Headphones: ImageVector by lazy { mingcute("Headphones", line("M18 14V11C18 7.68629 15.3137 5 12 5C8.68629 5 6 7.68629 6 11V14M18 14V18.25C18 18.6642 18.3358 19 18.75 19C19.9926 19 21 17.9926 21 16.75V16.5C21 15.1193 19.8807 14 18.5 14H18ZM6 14V18.25C6 18.6642 5.66421 19 5.25 19C4.00736 19 3 17.9926 3 16.75V16.5C3 15.1193 4.11929 14 5.5 14H6Z", 2f, BUTT, ROUND_JOIN)) }
    // Drawn here, not from MingCute: a crescent in the same 24-unit grid and 2-unit round stroke as the set.
    val Moon: ImageVector by lazy { mingcute("Moon", line("M20 14.2A8 8 0 0 1 9.8 4a8 8 0 1 0 10.2 10.2Z", 2f, ROUND, ROUND_JOIN)) }
    val Camera: ImageVector by lazy { mingcute("Camera", line("M17 7H18M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12ZM5 20H19C20.1046 20 21 19.1046 21 18V6C21 4.89543 20.1046 4 19 4H5C3.89543 4 3 4.89543 3 6V18C3 19.1046 3.89543 20 5 20Z", 2f, ROUND, MITER_JOIN)) }
    val Grip: ImageVector by lazy { mingcute("Grip", solid("M9.5 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m0 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m0 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m6-12a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m0 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m0 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0"), line("M9.5 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Zm0 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Zm0 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Zm6-12a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Zm0 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Zm0 6a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Z", 2f, BUTT, MITER_JOIN)) }
    val Trash: ImageVector by lazy { mingcute("Trash", line("m5 6 .876 13.133A2 2 0 0 0 7.87 21h8.258a2 2 0 0 0 1.995-1.867L19 6M8 6l.772-2.316A1 1 0 0 1 9.721 3h4.558a1 1 0 0 1 .949.684L16 6m-6 5v5m4-5v5M4 6h16", 2f, ROUND, MITER_JOIN)) }
    val CircleClose: ImageVector by lazy { mingcute("CircleClose", line("m9.172 9.171 5.656 5.657m-5.656 0 5.656-5.656M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", 2f, ROUND, MITER_JOIN)) }
    val Plus: ImageVector by lazy { mingcute("Plus", line("M5 12h14m-7 7V5", 2f, ROUND, MITER_JOIN)) }
    val Info: ImageVector by lazy { mingcute("Info", line("M12 8h.002M11 11h1v6h.5m8.5-5a9 9 0 1 1-18 0 9 9 0 0 1 18 0", 2f, ROUND, ROUND_JOIN)) }
    val EyeSlash: ImageVector by lazy { mingcute("EyeSlash", line("m14.33 14.693.646 2.415m3.388-4.744 1.768 1.768m-10.462.561-.647 2.415m-3.387-4.744-1.768 1.768M4 9c2.36 7.965 13.64 7.965 16 0", 2f, ROUND, ROUND_JOIN)) }
    val Eye: ImageVector by lazy { mingcute("Eye", line("M21 12c0 2.5-4.03 7-9 7s-9-4.5-9-7 4.03-7 9-7 9 4.5 9 7Z", 2f, BUTT, MITER_JOIN), line("M11.012 10.262a3 3 0 0 0 2.725 2.725A1.997 1.997 0 0 1 10 12c0-.745.408-1.394 1.012-1.738Z", 2f, BUTT, MITER_JOIN)) }
    val Hand: ImageVector by lazy { mingcute("Hand", line("M20 11v3a7 7 0 0 1-7 7h-.674a7 7 0 0 1-6.26-3.87L3 11c2-1 3-.5 5 2V5.5a1.5 1.5 0 1 1 3 0V11 3.5a1.5 1.5 0 0 1 3 0V10 5.5a1.5 1.5 0 0 1 3 0V11 8.5a1.5 1.5 0 0 1 3 0v3.833", 2f, ROUND, ROUND_JOIN)) }
    val Update: ImageVector by lazy { mingcute("Update", line("M12 12v9m-3-3 3 2.995L15 18m-9.5-1.29a4.001 4.001 0 0 1 .526-7.59.01.01 0 0 0 .007-.011 5.5 5.5 0 0 1 10.776-2.05.01.01 0 0 0 .008.007 5.001 5.001 0 0 1 1.683 9.265", 2f, ROUND, ROUND_JOIN)) }
    val Gear: ImageVector by lazy { mingcute("Gear", line("M17.947 5.545a.51.51 0 0 0-.171-.447 9 9 0 0 0-2.684-1.551.51.51 0 0 0-.473.075c-.761.548-1.658.88-2.619.88-.96 0-1.858-.332-2.62-.88a.51.51 0 0 0-.473-.075 9 9 0 0 0-2.683 1.552.51.51 0 0 0-.171.446c.093.933-.068 1.875-.548 2.706-.48.832-1.215 1.443-2.07 1.828a.51.51 0 0 0-.302.373 9 9 0 0 0 0 3.098.51.51 0 0 0 .301.373c.856.386 1.59.997 2.07 1.828s.642 1.773.549 2.706a.51.51 0 0 0 .171.447 9 9 0 0 0 2.683 1.552c.16.058.336.024.474-.075.761-.549 1.659-.88 2.619-.88s1.858.331 2.62.88a.51.51 0 0 0 .473.075 9 9 0 0 0 2.683-1.552.51.51 0 0 0 .171-.447c-.093-.933.068-1.875.548-2.706s1.215-1.442 2.07-1.828a.51.51 0 0 0 .302-.373 9 9 0 0 0 0-3.098.51.51 0 0 0-.301-.373c-.856-.385-1.59-.996-2.07-1.828-.48-.83-.642-1.773-.549-2.706Z", 2f, BUTT, ROUND_JOIN), line("M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z", 2f, BUTT, ROUND_JOIN)) }
    val Repeat: ImageVector by lazy { mingcute("Repeat", line("M4 14V8a2 2 0 0 1 2-2h12m2 4v6a2 2 0 0 1-2 2H6", 2f, ROUND, MITER_JOIN), solid("M16.578 3.654c-.28-.146-.604.065-.631.411a25 25 0 0 0-.073 1.93c0 .848.04 1.538.078 1.996.027.324.323.503.598.36a19 19 0 0 0 1.55-.91 20 20 0 0 0 1.476-1.056c.248-.196.259-.574.023-.762a19 19 0 0 0-1.498-1.074 19 19 0 0 0-1.523-.895m-9.162 12c.28-.146.604.065.632.411a25.4 25.4 0 0 1-.006 3.926c-.026.324-.323.503-.598.36a19 19 0 0 1-1.55-.91 20 20 0 0 1-1.476-1.056c-.248-.196-.258-.574-.023-.762a20 20 0 0 1 1.499-1.074 19 19 0 0 1 1.522-.895")) }
    val RepeatOne: ImageVector by lazy { mingcute("RepeatOne", line("M17 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6m-9.5 0 1.5-1v5", 2f, ROUND, ROUND_JOIN), solid("M16.579 2.654c-.28-.146-.605.065-.632.411a25 25 0 0 0-.072 1.93c0 .848.04 1.538.077 1.996.027.324.323.503.599.36.368-.192.905-.492 1.55-.91a20 20 0 0 0 1.476-1.056c.247-.196.258-.574.022-.762a19 19 0 0 0-1.498-1.074 19 19 0 0 0-1.523-.895")) }
    val Refresh: ImageVector by lazy { mingcute("Refresh", line("m19.96 10.41-1.708-.382c-.107-.024-.169.12-.077.181l2.673 1.801a.098.098 0 0 0 .154-.081A9.003 9.003 0 0 0 3.307 9.67 9 9 0 0 0 19.487 17", 2f, ROUND, ROUND_JOIN)) }
    val CirclePlay: ImageVector by lazy { mingcute("CirclePlay", line("M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", 2f, BUTT, ROUND_JOIN), line("M9.99 8.52s1.253.488 3.018 1.506c1.764 1.02 2.813 1.86 2.813 1.86s-1.021.823-2.814 1.858-3.016 1.508-3.016 1.508-.205-1.32-.205-3.366.205-3.366.205-3.366Z", 2f, BUTT, ROUND_JOIN)) }
    val Palette: ImageVector by lazy { mingcute("Palette", solid("M8 12.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m2-4a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0m5 0a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0"), line("M17.902 15.484c1.322.22 2.682-.458 2.936-1.773a9 9 0 1 0-8.469 7.282c1.292-.053 1.891-1.472 1.313-2.63a2.115 2.115 0 0 1 .396-2.44l.089-.09a2.29 2.29 0 0 1 1.995-.64z", 2f, BUTT, MITER_JOIN), line("M8 12.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Zm2-4a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Zm5 0a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0Z", 2f, BUTT, MITER_JOIN)) }
    val ChevronDown: ImageVector by lazy { mingcute("ChevronDown", line("M17.657 9.343 12 15 6.343 9.343", 2f, ROUND, ROUND_JOIN)) }
    val House: ImageVector by lazy { mingcute("House", line("M3.004 10h-.001v-.002l8.383-6.52a1 1 0 0 1 1.228 0l8.383 6.52V10H19v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9z", 2f, BUTT, ROUND_JOIN), line("M10 14a2 2 0 1 1 4 0v6h-4z", 2f, BUTT, ROUND_JOIN)) }
    val History: ImageVector by lazy { mingcute("History", line("M12 7v5l3 3m5-3.03-1.607-.42a.1.1 0 0 0-.1.162l2.251 2.588c.052.06.15.038.17-.04q.148-.567.22-1.144A9.003 9.003 0 0 0 4.205 7.5 9 9 0 0 0 18.08 18.639", 2f, ROUND, ROUND_JOIN)) }
    val Leaf: ImageVector by lazy { mingcute("Leaf", line("M5 21c.5-3.5 3-8 7-10m2-5.5C16 5 17 4 17 4c6 9.5-2.055 19.65-11 14-3.5-3-2-8.333 0-10 3-2.5 6.312-2.078 8-2.5", 2f, ROUND, ROUND_JOIN)) }
    val Cloud: ImageVector by lazy { mingcute("Cloud", solid("M12 17a1 1 0 1 0 0 2zm.01 2a1 1 0 0 0 0-2zm4.94-5.95a1 1 0 0 0 1.414-1.414l-.707.707zm2.828-2.828a1 1 0 0 0 1.414-1.415l-.707.707zM2.808 8.807a1 1 0 0 0 1.414 1.415l-.707-.708zm2.828 2.829A1 1 0 1 0 7.05 13.05l-.707-.707zm2.828 2.828a1 1 0 1 0 1.414 1.414l-.707-.707zM5.636 3.222a1 1 0 0 0-1.414 1.414l.707-.707zm12.728 15.556a1 1 0 0 0 1.414-1.414l-.707.707zm-7.309-8.723-.707.707zM12 18v1h.01v-2H12zm0-8v1c1.933 0 3.682.782 4.95 2.05l.707-.707.707-.707A8.98 8.98 0 0 0 12 9zm0-4v1c3.038 0 5.786 1.23 7.778 3.222l.707-.708.707-.707A12.96 12.96 0 0 0 12 5zM3.515 9.514l.707.708a11 11 0 0 1 1.82-1.471l-.542-.84-.542-.84a13 13 0 0 0-2.15 1.736zm2.828 2.829.707.707a7 7 0 0 1 1.803-1.305l-.45-.893-.45-.893a9 9 0 0 0-2.317 1.677zM4.929 3.929l-.707.707L7.06 7.475l.707-.708.707-.707-2.839-2.838zm2.839 2.838.352.936A11 11 0 0 1 12 7V5c-1.612 0-3.158.294-4.585.832zm0 0-.707.708 3.287 3.287.707-.707.707-.707L8.475 6.06zm3.287 3.288-.707.707 8.016 8.016.707-.707.707-.707-8.016-8.016zm0 0 .117.993Q11.579 11 12 11V9q-.538 0-1.062.062zM9.171 15.17l.707.707c.385-.384.87-.663 1.412-.794l-.235-.972-.235-.972a5 5 0 0 0-2.356 1.324z")) }
    val Check: ImageVector by lazy { mingcute("Check", line("m3.514 11.83 5.657 5.656L20.485 6.172", 2f, ROUND, ROUND_JOIN)) }
    val CircleUser: ImageVector by lazy { mingcute("CircleUser", line("M5.628 18.356C7.09 17.04 9.4 16 12 16s4.91 1.04 6.372 2.356M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-6-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z", 2f, BUTT, MITER_JOIN)) }
    val Sort: ImageVector by lazy { mingcute("Sort", line("M18 5v14m-2.828-2L18 19.828 20.828 17M4 12h9M4 5h9M4 19h7", 2f, ROUND, ROUND_JOIN)) }
    val ListPlay: ImageVector by lazy { mingcute("ListPlay", line("M4 18h3m-3-6h5M4 6h8m4 11.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm0 0V10m0 0V6.562a2 2 0 0 1 1.515-1.94l1.864-.467A.5.5 0 0 1 20 4.64v3.58a1 1 0 0 1-.758.97z", 2f, ROUND, MITER_JOIN)) }
    val Logout: ImageVector by lazy { mingcute("Logout", line("M12 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5m0-8h7.5M17 9.172 19.828 12 17 14.828", 2f, ROUND, ROUND_JOIN)) }
    val ChevronRight: ImageVector by lazy { mingcute("ChevronRight", line("M9.343 6.343 15 12l-5.657 5.657", 2f, ROUND, ROUND_JOIN)) }
}

private sealed interface Part

private class Line(val d: String, val width: Float, val cap: StrokeCap, val join: StrokeJoin) : Part

private class Solid(val d: String, val evenOdd: Boolean) : Part

private val ROUND = StrokeCap.Round
private val BUTT = StrokeCap.Butt
private val ROUND_JOIN = StrokeJoin.Round
private val MITER_JOIN = StrokeJoin.Miter

private fun line(d: String, width: Float, cap: StrokeCap, join: StrokeJoin): Part = Line(d, width, cap, join)

private fun solid(d: String, evenOdd: Boolean = false): Part = Solid(d, evenOdd)

private fun mingcute(name: String, vararg parts: Part): ImageVector =
    ImageVector.Builder(name = "ring.$name", defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
        .apply {
            parts.forEach { part ->
                when (part) {
                    is Line -> addPath(
                        pathData = addPathNodes(part.d),
                        stroke = SolidColor(Color.Black),
                        strokeLineWidth = part.width,
                        strokeLineCap = part.cap,
                        strokeLineJoin = part.join,
                    )
                    is Solid -> addPath(
                        pathData = addPathNodes(part.d),
                        fill = SolidColor(Color.Black),
                        pathFillType = if (part.evenOdd) PathFillType.EvenOdd else PathFillType.NonZero,
                    )
                }
            }
        }
        .build()
