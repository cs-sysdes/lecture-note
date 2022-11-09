# 10: アカウント管理機能 (2)
[前回](09_account_management_1.md)に引き続き[仕様書](https://cs-sysdes.github.io/todolist.html)に示す基本仕様 S-1.3 および S-1.4 について実装を進めます．

今回は主にログイン・ログアウトの機能を実装し，ログイン状態に応じてページアクセスを制限する仕組みを実装します．
また，ユーザとタスクを紐づけ，ユーザ自身が登録したタスクのみを閲覧・編集可能とするようアプリケーションを修正します．

1. ログイン・ログアウト機能
2. ユーザとタスクの紐付け
3. ユーザの削除

ユーザ名やパスワードなどのユーザ情報を変更する機能については，基本仕様に含まれていますが，[タスクの編集機能](07_task_management.html#既存タスクの編集)と同様ですので資料内では扱いません．
各自で実装を進めて下さい．
注意点として，パスワード変更の際には元のパスワードを同時に入力させ，たしかにユーザ自身による操作であることを確認したうえでパスワードを更新する仕組みがあると親切でしょう．

以下の内容は[前回](09_account_management_1.md)実装したユーザデータを使用する機能になります．
前回の内容をまだ終えていない場合は，先にそちらに取り組んでください．


## ログイン・ログアウト機能
登録したユーザ情報に基づいて，アプリケーション内でログイン状態・ログアウト状態を切り替える機能を実装します．
状態管理が必要になる部分ですので，[第5回](05_state_management_2.md)において扱った「セッション方式」を採用することとします．

### セッション管理の準備
以前と同様に自力で Cookie の管理を行っても良いのですが，ここでは特に Gin フレームワーク上でセッション管理を行うためのプラグインを使用して楽をしましょう．
以下のコマンドを実行し，依存モジュール [github.com/gin-contrib/sessions](https://pkg.go.dev/github.com/gin-contrib/sessions) をプロジェクトに追加します．

```sh
$ docker-compose exec app go get github.com/gin-contrib/sessions
```

このコマンドを実行したのち，Docker コンテナを再ビルドする際にエラーが発生する場合があります．
もし `docker-compose up -d` がうまく動かなくなった場合は，Slack に質問を投げてください．

アプリケーション内でセッション機能を有効化するため，todolist.go/main.go に対し以下 8～9 行目および 21～23 行目に示す追加実装を行います．

<span class="filename">todolist.go/main.go</span>
```go
package main

import (
    ...
	"github.com/gin-gonic/gin"
	_ "github.com/go-sql-driver/mysql"

    "github.com/gin-contrib/sessions"
    "github.com/gin-contrib/sessions/cookie"
    ...
)

const port = 8000

func main() {
    ...
	// initialize Gin engine
	engine := gin.Default()
	engine.LoadHTMLGlob("views/*.html")

    // prepare session
    store := cookie.NewStore([]byte("my-secret"))
    engine.Use(sessions.Sessions("user-session", store))

	// routing
	engine.Static("/assets", "./assets")
	engine.GET("/", service.Home)
    ...
```

8～9行目において，先ほどプロジェクトに追加したパッケージを import し，利用可能にしています．
それぞれ 8 行目がセッション管理機能を提供するパッケージ，9 行目がセッションの状態を Cookie で管理するためのパッケージになります．

22～23 行目の記述が，実際にセッション管理を有効化するコードです．
22 行目の変数 `store` は，Cookie を使用してセッション情報を保存する仕組みを提供するためのインタフェースになります．
23 行目において Gin のルーティングエンジンに対し変数 `store` を利用したセッション管理機能を追加し，有効化しています．

22, 23 行目に出現する文字列 `"my-secret"` および `"user-session"` は，それぞれ任意の文字列を使用することができます．
`"my-secret"` は Cookie を検証するための署名鍵であり，32バイトあるいは64バイトの文字列であることが推奨されていますが，ここでは特に気にせず適当な文字列を使用しています．
Cookie の値は Client-side で書き変えることが容易に可能であるため，署名鍵の検証を行うことで安全性を高めています．
`"user-session"` はセッション名であり，複数のセッションを並行して利用する際にセッションの識別を行うために使用しますが，今回は単一セッションなので特に気にしなくて良いです．

これらのコードを追加したことで，アプリケーションに対するすべての通信においてセッションの使用が可能になります．
セッションを使用する準備ができたので，ログイン機能から順に実装していきます．


### ログイン機能
ログインに必要な処理は，送信されたユーザ名およびパスワードを登録済みのユーザ情報と照らし合わせ，適切なユーザによるログインであることを認証することです．
また，ユーザアカウントの役割を考えると，セッションにユーザ ID を関連づけ，どのユーザによるセッションなのかを識別できるようにした方が良いでしょう．

はじめに，ログインフォームを作成します．
ログインフォームは /login に対する GET リクエストで表示するようルーティングを行うこととします．
トップページなどにリンクを配置し，ログイン画面へ誘導できるようにしておきましょう．

ログインページを todolist.go/views/login.html に作成します．

<span class="filename">todolist.go/views/login.html</span>
```html
{{ template "header" . }}
<h1>Login</h1>
{{ if .Error }}
<p><font color="#FF0000">{{ .Error }}</font></p>
{{ end }}
<form action="/login" method="POST">
    <label>ユーザ名: </label><input type="text" name="username" value="{{ .Username }}" required><br>
    <label>パスワード: </label><input type="password" name="password" required></br>
    <input type="submit" value="ログイン">
</form>
<p><a href="/user/new">ユーザ登録</a></p>
{{ template "footer" }}
```

ログインページはユーザ登録ページとほぼ同じ構造なので詳しい説明は省略します．
一つ新しい要素として，ここでは `input[type="password"]` を使用することで，下記のように入力値を隠すよう実装しています．

<div style="margin: auto 20pt">
<label>パスワード: </label><input type="password" value="test">
</div>

次に todolist.go/service/user.go を編集し，/login への POST リクエストに対してログイン処理を実行する関数 `Login` を追加します．

ログイン状態の判別は，セッションにユーザ ID が割当てられているかによって行うこととします．
すなわち，セッションがユーザ ID を持っていれば当該 ID を持つユーザによってログインされている状態，ユーザ ID を持っていなければ非ログイン状態であると判定します．
したがって，関数 `Login` が行うべき処理は，以下の 4 つになります．

1. 送信されたユーザ名およびパスワードの取得
2. 該当するユーザの検索
3. パスワードの一致判定
4. セッションへのユーザ ID の保存

2 および 3 の処理において，たとえば該当するユーザが存在しない，あるいはパスワードが一致しないなどのエラーを検出した場合，ログインページにエラーの内容を表示して再入力を促すようにします．

<span class="filename">todolist.go/service/user.go</span>
```go
package service

import (
    "crypto/sha256"
    "encoding/hex"
    "net/http"
    
    "github.com/gin-gonic/gin"
    "github.com/gin-contrib/sessions"
    database "todolist.go/db"
)

...

const userkey = "user"

func Login(ctx *gin.Context) {
    username := ctx.PostForm("username")
    password := ctx.PostForm("password")

    db, err := database.GetConnection()
    if err != nil {
		Error(http.StatusInternalServerError, err.Error())(ctx)
		return
    }

    // ユーザの取得
    var user database.User
    err = db.Get(&user, "SELECT id, name, password FROM users WHERE name = ?", username)
    if err != nil {
        ctx.HTML(http.StatusBadRequest, "login.html", gin.H{"Title": "Login", "Username": username, "Error": "No such user"})
        return
    }

    // パスワードの照合
    if hex.EncodeToString(user.Password) != hex.EncodeToString(hash(password)) {
        ctx.HTML(http.StatusBadRequest, "login.html", gin.H{"Title": "Login", "Username": username, "Error": "Incorrect password"})
        return
    }

    // セッションの保存
    session := sessions.Default(ctx)
    session.Set(userkey, user.ID)
    session.Save()

    ctx.Redirect(http.StatusFound, "/list")
}
```

ハッシュ値の比較 (等価判定) のために，パッケージ `encoding/hex` の import を追加しています．
また，ログイン状態をセッションに記録するため，パッケージ `github.com/gin-contrib/sessions` も import します．

DB から取得する `user.Password` は，パスワード文字列をダイジェスト化したものです．
したがって，パスワードを照合する場合は，入力されたパスワードも `hash` 関数を通してダイジェスト化した上で一致判定を行う必要があります．
ダイジェスト化に使用している一方向性関数 SHA-256 は決定的関数であり，同じ入力に対して常に同じハッシュ値を返すため，パスワードが一致するならハッシュ値も一致します．
ただし，逆は一般に成立しません (ハッシュ値の衝突が起こり得ます)．

`user.Password` は `[]byte` 型の変数として定義されており，関数 `hash` の戻り値も `[]byte` 型です．
直接 `user.Password == hash(password)` として比較してしまうと，これはスライスの比較となるため正常にパスワードの一致判定をすることができません．
したがって，ここでは `hex.EncodeToString` 関数を使用して文字列にエンコードした上で比較を行っています．

セッションへのユーザ ID の保存は以下の手順で行います．

1. いま処理している通信のセッションを習得
2. セッションに key-value ペアの形式で保存したい情報 (ユーザ ID) を記入
3. セッション情報の更新 (保存)

[セッション管理の準備](#セッション管理の準備) において todolist.go/main.go に記述したセッション管理を有効化するコードにより，すべての通信には接続元に応じてセッションが紐づけられるようになっています．
したがって，いま処理している通信のセッションは，42 行目に示すように `sessions.Default` 関数で取得可能となっています．

適当な名前 `userkey := "user"` を定義し，セッション中に `user=<user ID>` の形式でユーザ ID を記入します (43 行目)．
最後に `sessions.Session.Save` メソッドを呼びセッション情報に加えた更新を有効化します (44 行目)．

以上の処理によりセッション上にユーザ ID が載るため，次回以降の接続ではセッション中のユーザ ID の値を確認することで，どのユーザによってログインされているセッションであるかを識別できます．
また，セッション中にユーザ ID が保存されていなければ，未ログイン状態のユーザによるアクセスであることを判別できます．

ログインページの表示およびログイン処理に関して適切なルーティングを設定し，またトップページなどにログインページへのリンクを設置し，ログイン機能が適切に動作することを確認しましょう．
ログインに成功した場合は /list へリダイレクトされ，失敗した場合はエラーが表示されるはずです．
ユーザ名やパスワードをわざと間違えてみて，想定通りの動作を行うか調べてみるとよいでしょう．

ここまででユーザアカウントを用いたログイン処理ができるようになりました．
しかしながら，現在のアプリケーションはログイン状態に依らず誰しもがすべてのページへアクセス可能になっています．
これではログイン機能の意味がないので，いくつかのページにアクセス制限をかけてログイン状態でなければページを表示できないようにしてみます．

### アクセス制限
ここではタスクの表示機能にアクセス制限をかけることとします．
すなわち，ログインしているユーザはタスクの一覧表示や登録機能，編集機能を使用できますが，ログインしていないユーザはログインページへ誘導されてしまうような仕組みの実装を目指します．

本資料ではセッションにユーザ ID が割当てられているかによってログイン状態を判別するよう実装を進めてきました．
したがって，セッション上のユーザ ID を検査し，割当てがある場合のみタスクの一覧表示などの処理を正常に行うことで，アクセス制限を実現することができます．
セッションにユーザ ID 割当てがない場合は，即座にログインページへリダイレクトすることで，リクエストを弾いていきます．

素朴な実装を考えれば，アクセス制限をかけたいリクエスト対象すべての関数の冒頭においてセッションにユーザ ID が含まれるかを確認するコードを実装するとよいでしょう．
たとえば以下のようになります (これは例ですので実装する必要はありません)．

<span class="filename">todolist.go/service/task.go</span>
```go
func TaskList(ctx *gin.Context) {
    // アクセス制限の例
    userID := session.Default(ctx).Get("user")
    if userID == nil {
        ctx.Redirect(http.StatusFound, "/login")
        return
    }
    ...
```

実装自体は単純ですが，これを該当するすべての関数に追加するのは面倒ではないでしょうか．
また，今後アクセス制限をかけたい処理が増える可能性を考えると，まとめて管理できる仕組みがほしくなります．

この要求に応えるため，ここでは Gin フレームワークのもつ **middleware** という機能を利用して，よりアクセス制限を管理しやすい実装を行います．
Gin における **middleware** とは，実際に処理を行う関数 (ハンドラ) と同じ形式を持つ関数 (`func(*gin.Context)` 型) によって定義される共通処理を意味します．
middleware を使用することで，リクエストに応じた個々の処理の手前で実行すべき共通処理を，ルーティング時に (まとめて) 挿入することができます．

#### middleware の実装

ログイン処理を担当する middleware を以下に示す `LoginCheck` 関数として実装します．
ログイン処理はユーザ関連の処理であり，また変数 `userkey` にアクセスしたいため，todolist.go/service/user.go ファイル内に定義しています．
本来であれば，todolist.go/service/auth.go などとして，認証処理だけでファイルを分割する方が設計上は良いかもしれません．

<span class="filename">todolist.go/service/user.go</span>
```go
func LoginCheck(ctx *gin.Context) {
    if sessions.Default(ctx).Get(userkey) == nil {
        ctx.Redirect(http.StatusFound, "/login")
        ctx.Abort()
    } else {
        ctx.Next()
    }
}
```

ログイン処理自体は，セッション上のユーザ ID を検査するだけなので，それほど難しくはないと思います．
２行目に示すように，セッションを取得し，セッション中に `userkey` に該当する値が存在することを確認できればログイン状態，そうでなければ (= `nil` であれば) 非ログイン状態となります．
非ログイン状態の場合，ログインページへのリダイレクトを指定します (3行目)．

middleware は中間処理を記述するものなので，次の middleware あるいは最終処理を継続して実行すべきか指示する必要があります．
非ログイン状態では，ログインページへリダイレクトした後の処理はすべてスキップしたい (リクエストをここで弾きたい) ので，`gin.Context.Abort` メソッドを呼び出して処理の終了を明示します (4 行目)．
一方，ログイン状態では，そのまま処理を継続してほしいので，`gin.Context.Next` メソッドによってその旨を明示します (6 行目)．

このように，middleware を定義する際は基本的に `Abort` メソッドか `Next` メソッドを最後に呼び出す必要がある点に注意してください．

#### middleware の適用

定義した middleware を実際に使用していきます．
現状のルーティング設定に対し middleware を追加していくよう実装を進めます．
以下に現状のルーティング設定を示しますが，各自で追加定義したルーティングなどがあれば適宜補いながら進めてください．

<span class="filename">todolist.go/main.go</span>
```go
...
	// routing
	engine.Static("/assets", "./assets")
	engine.GET("/", service.Home)

    engine.GET("/list", service.TaskList)

    engine.GET("/task/:id", service.ShowTask) // ":id" is a parameter
    engine.GET("/task/new", service.NewTaskForm)
    engine.POST("/task/new", service.RegisterTask)
    engine.GET("/task/edit/:id", service.EditTaskForm)
    engine.POST("/task/edit/:id", service.NotImplemented)
    engine.GET("/task/delete/:id", service.DeleteTask)

    engine.GET("/user/new", service.NewUserForm)
    engine.POST("/user/new", service.RegisterUser)

	engine.GET("/login", service.LoginForm)
	engine.POST("/login", service.Login)
...
```

はじめに，パッケージの一覧表示に対し middleware を追加します．
middleware の追加方法は大きく分けて 2 つ存在しますが，ここでは単純にリクエストに対する処理として追加する方法をとります．

6 行目のルーティング設定を以下のように変更し，middleware を適用します．
Gin フレームワークのルーティング設定では，このように複数の処理をリクエストに紐づけることができます．
リクエストを処理する関数と middleware は同じ型を持っているため，このような指定が可能となっています．

```go
...
    engine.GET("/list", service.LoginCheck, service.TaskList)
...
```

上記のように複数の処理を同一リクエストに結び付けた場合，それぞれ先頭から順に処理が適用されます．
一般に一番末尾の処理がリクエストに対して行いたい処理になるため，その前に middleware を挟むイメージとなります．

今回の場合は，まず middleware である `service.LoginCheck` 関数が呼ばれ，ログイン済みのセッションであれば `service.TaskList` を呼び出すよう処理が進みます．
非ログイン状態のセッションであった場合は，middleware 内でリダイレクトの設定がなされたうえで処理が中断されるため，`service.TaskList` は呼び出されません．

次に middleware を追加する方法の 2 つ目として，ルーティングの**グループ化**による一括追加を行います．
対象はタスクの表示・新規登録・編集・削除など，タスクに関連するリクエスト処理に対し一括してアクセス制限をかけます．

**グループ化**は Gin フレームワークの持つ機能の一つであり，複数のパスの一括管理を可能にします．
たとえば，8～13 行目に記述されたタスク関連のルーティングはすべて /task という共通パスを持っていますが，こうした共通パスを持つルーティングをグループ化できます．

8～13 行目のルーティング設定に対し，グループ化を用いて middleware の設定を行うと以下のようになります．

```go
...
    taskGroup := engine.Group("/task")
    taskGroup.Use(service.LoginCheck)
    {
        taskGroup.GET("/:id", service.ShowTask)
        taskGroup.GET("/new", service.NewTaskForm)
        taskGroup.POST("/new", service.RegisterTask)
        taskGroup.GET("/edit/:id", service.EditTaskForm)
        taskGroup.POST("/edit/:id", service.NotImplemented)
        taskGroup.GET("/delete/:id", service.DeleteTask)
    }
...
```

`Group` メソッドによって /task をプレフィックスパスとするグループを定義し，タスク関連のリクエスト処理をグループ化します．
middleware は `Use` メソッドで一括適用が可能であり，上記のコードではグループ内のすべてのルーティング設定に対し，`service.LoginCheck` を middleware として追加しています．

グループ内のルーティング設定では，いま /task をプレフィックスパスとして設定したため，すべてのパスから /task を削除する必要があります．
たとえば上記 5 行目は，これだけでは /:id へのルーティングに見えますが，/task を上位パスとして持つグループへのルーティングであるため，実際には /task/:id へのルーティングを意味します．
その他のパスも同様に /task を明示的に指定されていませんが，グループ全体で上位パス /task を共有しているため，これまでと同様のパス設定となっています．

グループ内のすべてのパスは `service.LoginCheck` を middleware として設定されているので，どのパスにアクセスしてもユーザ ID の検査が実行されます．
すなわち，こられのパスに対するアクセス制限が一括で適用できているということになります．

---

さて，ここまででアクセス制限の適用が完了しているので，非ログイン状態では /list や /task/new にアクセスできないことを確認してみましょう．
非ログイン状態でこれらのページへアクセスした場合，ログインページへリダイレクトされれば成功です．
また，ログイン後はこれらのページに遷移可能であることも確かめてみましょう．

なお，現状ではログアウト機能がないため，一旦ログインしてしまうと簡単に非ログイン状態に戻る方法がありません．
ログイン状態と非ログイン状態を手軽に切り替えたい場合は，2 つの異なるブラウザでアプリケーションを開くか，ブラウザのプライベートモードを使用してください．
また，ブラウザの開発者モードに慣れている人であれば，Cookie からセッション情報を削除する機能がありますので，そちらを使用すると良いでしょう．

<div class="memo">
ここに示した middleware の記述・実装方法は Gin フレームワーク固有のものです．
Go 言語で実装された多くの有名な Web フレームワークには，middleware を記述・実装する同様の仕組みがありますが，それぞれ表現方法は異なるかもしれません．

また，他のプログラミング言語で実装された Web フレームワークなどには，middleware に相当する機能がない場合もあります．
しかしながら，共通処理を後から挟みこむ middleware の考え方は，プログラム設計の一般論として有用なテクニックだと思いますので，ここで扱うこととしました．
</div>

### ログアウト機能
ログアウトできないのは不便なので，ログアウト機能をつけます．

ログイン状態はセッションにユーザ ID が保存されているか否かによって判定しています．
したがってログアウト処理では，セッションからユーザ ID を削除すると良いことがわかります．

便利なことに，セッションを管理する `sessions.Session` 構造体には `Clear` という名のセッション内の情報をすべて削除するメソッドがあるため，これを利用しましょう．
以下のように `Logout` 関数を実装します．

<span class="filename">todolist.go/service/user.go</span>
```go
...
func Logout(ctx *gin.Context) {
    session := sessions.Default(ctx)
    session.Clear()
    session.Options(sessions.Options{MaxAge: -1})
    session.Save()
    ctx.Redirect(http.StatusFound, "/")
}
```

`Logout` 関数は，セッションを取得 (3 行目) し，セッション上の情報を削除する (4 行目) のが主な動作になります．
５ 行目は Cookie の有効期間を -1 に設定することで即座に Cookie をリセットするようブラウザに通知するための記述です．
セッションの状態を更新したので忘れずに `Save` メソッドを呼び，適当なページへリダイレクトします．
当然ながら，リダイレクト先にはアクセス制限のかかったページ以外を指定します．

適切なルーティング設定を行った上で，ログアウトが可能であることを確かめましょう．
なお，ログアウトはログイン状態でのみ実行され得る処理なので，ログイン状態の時のみログアウトボタンを表示するなどの工夫をすると良いかもしれません


## ユーザとタスクの紐付け
ログイン・ログアウト機能およびアクセス制限が可能となりましたが，タスクの閲覧および登録・編集機能は未だにユーザと紐づいていません．
したがって，ログインさえできてしまえば誰でもタスクを閲覧できるし，他人が登録したタスクを勝手に編集することも可能です．
これではユーザごとにログインできる意味があまりないので，ここからはユーザとタスクを紐づけ，個々のユーザが自分のタスクのみ閲覧・編集できる仕組みを実装します．

ユーザとタスクを紐づけるには，主に以下に挙げる 2 通りの方法が考えられます．

1. タスクテーブルに所有ユーザを示すカラムを追加し，どのユーザのタスクであるかを管理する
2. ユーザとタスクを関連付けるテーブルを用意し，対応関係を管理する

どちらもメリット・デメリットを持ちますが，今回のように多対多の関係性を DB で管理する場合，2 の方法をとることがベターとされています．
というのも，仮に[追加仕様 S-2.4](https://cs-sysdes.github.io/todolist.html) に取り組むことを考えた場合，1 の方法ではひとつのタスクに対して複数のユーザを紐づけることが難しくなってしまうためです．

2 の方法を実装するためには，ユーザとタスクを関連付けて保持するためのテーブルを別に用意する必要があります．
こうしたテーブルは一般に**連想テーブル** (あるいは**交差テーブル**，**中間テーブル**，**結合テーブル** etc.) と呼び，DB におけるテーブル設計の推奨例として定着しています．

### 所有関係を保存する連想テーブルの定義
ユーザとタスクを関連付けるため，ユーザ ID とタスク ID を紐づけた連想テーブルを作成します．
関連付けにはユーザ名とタスク名のような属性を使用することも可能ですが，こうした属性は重複や変更が発生する可能性があるため，あまり適しているとは言えません．
一方で，ID はそれぞれのテーブルの主キーであり，同じ ID 値を持つ異なるユーザやタスクは存在しないことが保証されています．
また，ID は基本的に変化しない値なので，ユーザやタスクの実体を指し示す参照値として適しているといえます．

ユーザ ID とタスク ID からなる連想テーブル `ownership` を以下のように定義します．

<span class="filename">todolist.go/docker/db/sql/01\_create\_tables.sql</span>
```sql
...
DROP TABLE IF EXISTS `ownership`;

CREATE TABLE `ownership` (
    `user_id` bigint(20) NOT NULL,
    `task_id` bigint(20) NOT NULL,
    PRIMARY KEY (`user_id`, `task_id`)
) DEFAULT CHARSET=utf8mb4;
```

ユーザやタスクを管理するテーブルでは ID やデータの作成日時などの情報を付与していましたが，連想テーブルではそういった属性の付与は必要がない限り行いません．
ここでは，連想データの作成日時はタスクの作成日時と同一とみなせば良いため，特に設定していません．
また ID については，ユーザ ID とタスク ID からなる**複合主キー** (7 行目) を用いることで重複するユーザ ID とタスク ID のペアを挿入することができなくなり，これによってデータの唯一性は保証できるため設定していません．

テーブル構造を更新しているため，変更をアプリケーションに反映するためには Docker コンテナの初期化・再構築が必要になります．

### タスク表示処理の変更
連想テーブルにしたがって，各ユーザが自身の登録したタスクのみを表示できるよう変更を加えます．
ここでは特に一覧表示ページ /list に表示されるタスクが自身の登録タスクのみになるよう，`service.TaskList` 関数を修正します．

<span class="filename">todolist.go/service/task.go</span>
```go
...
func TaskList(ctx *gin.Context) {
    userID := sessions.Default(ctx).Get("user")
    ...
	// Get tasks in DB
	var tasks []database.Task
    query := "SELECT id, title, created_at, is_done FROM tasks INNER JOIN ownership ON task_id = id WHERE user_id = ?"
    switch {
    case kw != "":
        err = db.Select(&tasks, query + " AND title LIKE ?", userID, "%" + kw + "%")
    default:
        err = db.Select(&tasks, query, userID)
    }
    ...
}
```

まずはじめにセッション情報からログインユーザの ID を取得します (3 行目)．
ログインユーザの ID がセッション情報に含まれていることは middleware で確認済みなので，特にエラー処理は実装していません．
不正なユーザ ID を弾くため，可能であれば middleware 内でユーザ ID が整数値に変換可能であることくらいは検証しても良いでしょう．
なお，`sessions` パッケージを使用するため，import ブロックへ `github.com/gin-contrib/sessions` を追加するのを忘れないようにしてください．

`service.TaskList` 関数は，[検索キーワードの有無](08_search.md)によって DB へ発行するクエリが異なりますが，重複している部分もあるため変数 `query` として括り出します (7 行目)．
このクエリでは，`INNER JOIN` によって `tasks` テーブルと `ownership` テーブルを**結合** (特に**内部結合**) し，該当するユーザ ID を持つデータだけを抽出しています．
`INNER JOIN ownership ON task_id = id` は，`tasks` テーブルの `id` と `ownership` テーブルの `user_id` を関連付け，条件に合うデータのみを積集合 \\(\mathrm{tasks} \cap \mathrm{ownership}\\) から抽出します．
これにより，DB から取得できるタスクデータはログインユーザに関連付けられたもののみとなり，一覧画面には自身の登録したタスクのみが表示されるようになります．

なお，変数 `query` では `SELECT` の対象として ID やタイトルなどを明示的に指定しています．
`task` テーブルと `ownership` テーブルを結合したことにより，データの持つ属性に `ownership` テーブルの情報も含まれてしまうため，`*` による全属性指定では構造体 `Task` へのデータ束縛に失敗してしまいます．
したがって，ここでは明示的に取得する属性名を指定する必要があるわけです．
ちなみに，一般論として `SELECT * FROM ...` の使用はあまり推奨されず，このように必要な属性値を明示的に指定する方がお作法が良いとされることが多いと思いますので，面倒ですが明示的指定に慣れておく必要もあります．

ここまでを実装し，ログイン状態でタスクの一覧表示がどのように変化するかを確認してみましょう．
いまのところユーザに紐づいたタスクは存在しないはずであるため，データが存在しない旨が表示されれば成功です．

##### 練習問題 10-1
タスクの一覧表示ページでは，ユーザに関連づいたタスクのみをフィルタリングできるようになりました．
一方で，現在の実装では適当な ID 値 `<id>` を指定して URL 欄に直接 /task/\<id\> などと打ち込むことで，他人のタスクも覗き見ることが可能になっています．
これと同様に，他人のタスクの編集・削除も可能な状態です．
こうした挙動はセキュリティリスクですので，これが不可能となるよう実装を修正してください．

### タスク登録処理の変更
現状のタスク登録処理では，ユーザとタスクの紐づけを `ownership` テーブルに書き込む処理がありません．
したがって，このままタスクの登録処理を行っても，各ユーザのタスク一覧表示画面には永遠に登録したタスクが表示されないことになります．

ここではタスク登録処理を行う `service.RegisterTask` 関数を修正し，タスク登録時にタスクとユーザの紐づけを行う機能を実装します．

タスクの登録処理がとるべき手順は以下の通りになります．

1. セッションからユーザ ID の取得
2. 送信データに基づいて新規タスクの登録
3. 登録したタスクの ID とユーザ ID を `ownership` テーブルに記録

この手順から，修正後のタスク登録処理では，タスクデータの登録および連想テーブルの更新という 2 回の DB 操作が必要であることがわかります．
こうした複数回の DB 操作を行うにあたって問題となるのは，途中の処理でエラーが発生した場合の処理です．

たとえば，いまタスクの新規登録は正常に完了したが，連想テーブルの更新に失敗した場合を考えます．
この場合，タスク自体はたしかに登録されますが，ユーザとの紐づけがなされていないため，このタスクは存在するものの決して表示・編集ができないタスクとなります．
すなわち，データとしてどこからも参照・操作されず，ただ DB の容量を圧迫するだけの存在となってしまうわけです．

このような状況が発生してしまうと困ったことになるため，DB 操作が途中で失敗した場合には，すべての操作を巻き戻して元の状態に戻す (**Rollback** する) 仕組みが必要となります．
こうした機能を実現する DB の仕組みが**トランザクション**です．

Go 言語の標準パッケージである `database/sql` は，こうした DB のトランザクションを扱うための機能を有しています．
したがって，`database/sql` をラップした `github.com/jmoiron/sqlx` パッケージでもトランザクションを容易に扱うことができます．

トランザクションの機能を用いた `service.RegisterTask` の実装を以下に示します．

<span class="filename">todolist.go/service/task.go</span>
```go
...
func RegisterTask(ctx *gin.Context) {
    userID := sessions.Default(ctx).Get("user")
    // Get task title
    ...
	// Get DB connection
	db, err := database.GetConnection()
	if err != nil {
		Error(http.StatusInternalServerError, err.Error())(ctx)
		return
	}
    tx := db.MustBegin()
    result, err := tx.Exec("INSERT INTO tasks (title) VALUES (?)", title)
	if err != nil {
        tx.Rollback()
		Error(http.StatusInternalServerError, err.Error())(ctx)
		return
	}
    taskID, err := result.LastInsertId()
    if err != nil {
        tx.Rollback()
		Error(http.StatusInternalServerError, err.Error())(ctx)
		return
    }
    _, err = tx.Exec("INSERT INTO ownership (user_id, task_id) VALUES (?, ?)", userID, taskID)
    if err != nil {
        tx.Rollback()
		Error(http.StatusInternalServerError, err.Error())(ctx)
		return
    }
    tx.Commit()
    ctx.Redirect(http.StatusFound, fmt.Sprintf("/task/%d", taskID))
}
```

ユーザ ID は関数の冒頭でセッション情報より取得しています．
以前説明した部分ですなので，詳細は省略します．

12 行目の記述は，トランザクションの開始を宣言しています．
ここから先の DB アクセスは，変数 `db` ではなく変数 `tx` を介することで，すべてトランザクション内の処理として実行します．
トランザクション内の処理は `Tx.Commit` メソッドが呼ばれるまでは確定されません．
`Tx.Commit` メソッドによって確定される前であれば，`Tx.Rollback` メソッドによって Rollback することで，任意の段階でそれまでの処理をなかったことにできます．

開始したトランザクションでは，はじめに新規タスクデータの登録を行います (13～18 行目)．
失敗した場合はトランザクションを Rollback した上でエラーを表示して終了します．

タスクデータの登録に成功した場合，登録したタスクの ID を取得します (19～24 行目)．
タスク ID はユーザ ID との関連づけに使用するため，ここで取得しておく必要があります．
この処理も失敗する可能性があるため，失敗した場合は先ほどと同様にトランザクションを Rollback してエラーを表示します．

最後に，ユーザ ID とタスク ID のペアを `ownership` テーブルに登録します (25～30 行目)．
ここまで問題なく成功したことを確認出来たら，これらの処理を `Tx.Commit` メソッドにより有効化します (31 行目)．

以上でタスク登録処理の修正は終了です．
新しいタスクを登録し，たしかに登録したタスクのみが表示されることを確認してみましょう．
また，別のユーザでログインし，先ほど登録したタスクが表示されないことを確認しましょう．

## ユーザの削除
最後に，ユーザの削除について少し触れておきます．
本章は特にユーザアカウントの削除処理は少し面倒だということを理解してもらうことを目的とするため，具体的な実装については各自で取り組む課題とします．

ユーザデータに限らず，アプリケーションの管理するデータを削除するには主に以下の 2 通りの方法が考えられます．

1. 直接 DB 上から完全に消去してしまう方法 (物理削除)
2. 削除フラグを立てるだけとし，完全には消去しない方法 (論理削除)

1 の方法は一般に**物理削除**と呼ばれ，[タスクデータの削除](07_task_management.html#既存タスクの削除)を実装する際に使用しました．
この方法は一見簡単に思えますが，ユーザデータを対象とする場合は少々面倒です．

今回開発しているアプリケーションでは，ユーザにタスクが紐づいています．
したがってユーザを削除する場合，ユーザの持つタスクも同時に削除するのが自然です．
そのためには，`ownership` テーブルから該当するタスクの ID を取得し，`tasks` テーブルから該当するタスクを削除する必要があります．
また，`ownership` テーブルのデータも参照先のタスクが削除された後には不要ですので，これも削除する必要があります．
このように，ユーザアカウントのようなアプリケーションの動作の根幹に関わるデータを削除しようとすると，連鎖的に複数のデータの削除を行う必要性が生じるため，設計をしっかりしていないとかなり苦労します．
連想テーブルではカスケード規則を設定することで少し楽ができる部分もありますが，テーブル設計時にカスケード規則の動作への深い理解と適切な適用方法の考慮が必要になります．

2 の方法は一般に**論理削除**と呼ばれ，イメージとしては多くの OS で採用されている削除されたファイルを一時的にゴミ箱に移動する動作が該当します．
この方法ではユーザを削除したことを示すデータ (フラグ情報) を保存する領域を用意する必要がありますが，ユーザは実際には削除されていないため，ユーザに紐づいたタスクデータなどを削除する必要はなくなります．
また，削除したことにしているだけなので，万が一ユーザが復帰したいと申し出た場合でも，即座にユーザアカウントの回復処理を行うことができます．

一方で，ユーザデータは残ったままなので，恒久的に復帰する可能性がないユーザにとってはセキュリティリスクが高まります．
また，ユーザが復帰しなければ，そのユーザに関連付けられたタスクは参照も編集もされない「死にデータ」となってしまうため，サービスの継続稼働に伴って不要な記憶領域を圧迫していく原因となり得ます．
したがって，論理削除したデータに対し一定期間後に物理削除処理を実行するようなシステムの存在は自然であり，結局 1 の方法を実装することになってしまうわけです．

ここでは特にユーザデータを対象としたデータ削除の方法として 2 つの主な手法を紹介しました．
どちらも長所と短所を持った方法ですので，目的に合わせて適切な削除処理の実装を考える必要があります．
冒頭でも述べた通り，[基本仕様](https://cs-sysdes.github.io/todolist.html)に示されたユーザ削除処理の具体的な実装については，以下の通り練習問題とします．

##### 練習問題 10-2
ユーザの削除機能を実装してみましょう．
上述したどちらの方法を採用しても構いません．
また，ユーザに紐づいたタスクを削除するか残しておくかについても，各自でルールを定めて構いません．


## まとめ

本演習の資料は以上です．
[期末レポート課題](https://cs-sysdes.github.io/report.html)を出題していますので，単位取得を希望する方は期日までに提出をお願いします，
おつかれさまでした．
