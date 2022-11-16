# 09: アカウント管理機能 (1)
演習資料最後の 2 回は[仕様書](https://cs-sysdes.github.io/todolist.html)に示す基本仕様 S-1.3 および S-1.4 について実装を進めます．

今回は特に以下の手順でアカウント登録機能について実装します．

1. ユーザデータの定義
2. ユーザ登録機能
3. エラー表示


## ユーザデータの定義
要求仕様より，**ユーザは「アカウント名」により識別**され，**「パスワード」によって認証**されることになります．
したがって，アプリケーションは少なくとも**アカウント名**と**パスワード**のペアを内部に保持している必要があります．
これらの情報を以降では**ユーザ情報**と呼びます．

はじめにアプリケーションが保持するユーザ情報のためのテーブルを DB 内に定義します．

<span class="filename">todolist.go/docker/db/sql/01\_create\_tables.sql</span>
```sql
...
DROP TABLE IF EXISTS `users`;

CREATE TABLE `users` (
    `id`         bigint(20) NOT NULL AUTO_INCREMENT,
    `name`       varchar(50) NOT NULL UNIQUE,
    `password`   binary(32) NOT NULL,
    `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) DEFAULT CHARSET=utf8mb4;
```

ユーザ名はアカウントの識別に使用するため，重複するユーザ名の登録は禁止したい要求があります．
したがって，ユーザ名のためのフィールド `name` には UNIQUE 制約を付けています．

パスワードを平文のままシステム内に保存することはセキュリティリスクとなるため，ここではハッシュ化した上でバイナリデータとして保存することとします．
ハッシュ化には暗号学的ハッシュ関数の一つである [SHA256アルゴリズム](https://en.wikipedia.org/wiki/SHA-2) を採用するため，256&nbsp;bit (=&nbsp;32&nbsp;byte) のバイナリデータを保持するための領域 `binary(32)` を割当てます．

DB のテーブル定義を更新したため，更新を反映させるために Docker コンテナを初期化する必要があります．

次に，Go言語プログラム内でユーザ情報を扱うためのデータ構造を定義します．
フィールドの型とタグをテーブル定義に合わせて，構造体 `User` を実装します．

<span class="filename">todolist.go/db/entity.go</span>
```go
...
type User struct {
    ID        uint64    `db:"id"`
    Name      string    `db:"name"`
    Password  []byte    `db:"password"`
}
```

DB 内でバイナリデータとして保持するデータは，Go言語上では `[]byte` 型として受け渡しを行います．
DB 内では固定長データですが，プログラムでは可変長データとして扱います．

ここではプログラム内で使用する最低限のフィールドのみを定義しましたが，すべてのフィールドを定義しても構いません．
ただし，`updated_at` および `created_at` の値は基本的に DB によって管理されるため，プログラム内で変更操作を加えるケースはほとんどありません．


## ユーザ登録機能
ユーザを登録する機能を実装していきます．
大まかな処理の流れは[タスクの新規登録](07_task_management.html#タスクの新規登録)とほぼ同じです．

仮ルーティングを設定し，ユーザ登録画面の表示および登録処理の実装を進めます．

<span class="filename">todolist.go/main.go</span>
```go
    ...
    // ユーザ登録
    engine.GET("/user/new", service.NotImplemented)
    engine.POST("/user/new", service.NotImplemented)
    ...
```

### 登録画面
ユーザ登録のため，ユーザ名とパスワードを入力する画面を作成します．
タスクの新規登録画面を参考に，以下のような HTML テンプレートを配置します．

<span class="filename">todolist.go/views/new\_user\_form.html</span>
```html
{{ template "header" . }}
<h1>ユーザ登録</h1>
<form action="/user/new" method="POST">
    <label>ユーザ名: </label><input type="text" name="username" required><br>
    <label>パスワード: </label><input type="text" name="password" required><br>
    <input type="submit" value="登録">
</form>
{{ template "footer" }}
```

このフォームを返す処理を実装します．

ユーザ管理に関わる機能はタスク管理とは独立した機能になります．
したがって，これまでタスク管理機能を実装してきた todolist.go/service/task.go とは別に，todolist.go/service/user.go というファイルを新たに作成して処理を実装していきましょう．

<span class="filename">todolist.go/service/user.go</span>
```go
package service

import (
    "net/http"

    "github.com/gin-gonic/gin"
)

func NewUserForm(ctx *gin.Context) {
    ctx.HTML(http.StatusOK, "new_user_form.html", gin.H{"Title": "Register user"})
}
```

ルーティング設定を修正し，画面を表示できるようにします．
このとき，トップページなど各自で適当だと思う場所に /user/new へのリンクを配置し，URL を直接打ち込まなくともユーザ登録ページへたどり着けるようにしてください．
また，使い勝手を向上させるため，ユーザ登録ページに「戻る」ボタンなどを配置しても構いません．

### 登録処理
new\_user\_form.html を通じて Client-side から送信されたユーザ名およびパスワードに基づき，新しいユーザを登録する処理を実装します．

はじめに，パスワードをハッシュ化 (ダイジェスト化) する処理を関数として実装しておきます．
任意の文字列のハッシュ化には，標準パッケージ `crypto/sha256` を使用します．

<span class="filename">todolist.go/service/user.go</span>
```go
package service 

import (
    "crypto/sha256"
    "net/http"

    "github.com/gin-gonic/gin"
)

... // func NewUserForm を省略しています

func hash(pw string) []byte {
    const salt = "todolist.go#"
    h := sha256.New()
    h.Write([]byte(salt))
    h.Write(pw)
    return h.Sum(nil)
}
```

ここに定義した関数 `hash` は，入力として文字列 `pw` を受け取り，**salt** 文字列を付与したうえで 256&nbsp;bit のハッシュ値を計算し，計算したハッシュ値を `[]byte` 型で返します．
返されるハッシュ値は暗号学的ハッシュ関数 SHA-2 によって計算されたものであり，ハッシュ値から元の入力を復元することが非常に困難である性質 (一方向性) を持ちます．
したがって，DB 内にハッシュ値を保存している限り，DB 内のデータが漏洩しても容易には元のパスワードがわからないようにすることができます．

**salt** とは一般にセキュリティを高める目的で導入される任意の文字列です．
ここでは "todolist.go#" という文字列を指定していますが，実際には各自の好きな文字列を設定して良いです．
一般に複雑な salt を与えるほどパスワードの復元可能性は低くなるため，実用的なアプリケーションではユーザごとに固有のランダムな文字列を生成していたりします．

パスワードをハッシュ化する仕組みさえ作ってしまえば，残りの処理はほとんどタスクの新規登録処理と同じです．
`service.RegisterTask` 関数を参考に，`service.RegisterUser` 関数を作成します．

<span class="filename">todolist.go/service/user.go</span>
```go
package service 

import (
    "crypto/sha256"
    "net/http"

    "github.com/gin-gonic/gin"
    database "todolist.go/db"
)

... // func NewUserForm および func hash を省略しています

func RegisterUser(ctx *gin.Context) {
    // フォームデータの受け取り
    username := ctx.PostForm("username")
    password := ctx.PostForm("password")
    if username == "" || password == "" {
        Error(http.StatusBadRequest, "Empty parameter")(ctx)
        return
    }
    
    // DB 接続
    db, err := database.GetConnection()
    if err != nil {
		Error(http.StatusInternalServerError, err.Error())(ctx)
		return
    }

    // DB への保存
    result, err := db.Exec("INSERT INTO users(name, password) VALUES (?, ?)", username, hash(password))
    if err != nil {
		Error(http.StatusInternalServerError, err.Error())(ctx)
		return
    }

    // 保存状態の確認
    id, _ := result.LastInsertId()
    var user database.User
    err = db.Get(&user, "SELECT id, name, password FROM users WHERE id = ?", id)
    if err != nil {
		Error(http.StatusInternalServerError, err.Error())(ctx)
		return
    }
    ctx.JSON(http.StatusOK, user)
}
```

15, 16 行目にて，POST されたフォームデータを受け取っています．
入力フォームには `required` 属性を付けたので，基本的に空文字列が `username` あるいは `password` として送られてくることはありませんが，念のため 17～20 行目の非空文字チェックを実装しています．

30 行目にて送信されたユーザ情報からユーザデータを DB 中に新規登録します．
パスワードはそのまま DB に保存せず，`hash(password)` としてハッシュ値を登録するようにしています．
DB中の `users.name` 属性には UNIQUE 制約を付けたため，すでに登録されているユーザ名を重複して登録しようとした場合はエラー (`err != nil`) となります．

ユーザの登録処理が正常に終了した場合，本来であればログインページなどに遷移するのが自然かと思います．
しかしながら，現在のところログインページをまだ実装していないため，ここではユーザが正常に登録されていることを確認するだけに留めましょう．
動作確認のためにページを作成するのも面倒なので，37～40 行目には単純にデータだけを画面に表示する方法を示しています．

37～40 行目のコードでは，ユーザの登録状況を手っ取り早く表示するため，追加したユーザ情報を DB から取得し，そのまま Client-side へ返しています．
文字列化して `gin.Context.String` メソッドを使用して返しても良いのですが，構造体を返すだけなら `gin.Context.JSON` メソッドを使用して JSON オブジェクトとしてしまうと早いでしょう．

以上でユーザ登録の処理は実装できました．
ルーティング設定を更新し，動作確認を行ってください．
また，以下の練習問題に取り組み，ユーザ登録処理の理解を深めてみましょう．

##### 練習問題 9-1
パスワードがたしかにハッシュ化されていることを確認してみましょう．
また，いくつかのパスワードを登録し，それぞれどのようなハッシュ値になるか，および，元のハッシュ値を推測可能そうかについて確認してみましょう．

##### 練習問題 9-2
同じユーザ名で複数回のユーザ登録を行い，たしかにエラーとなることを確かめてみましょう．


## エラー表示
ここまではアカウント管理機能を実装するための基礎としてユーザ追加機能を実装しました．
今回最後の内容として，ユーザ登録画面を少し改良し，使い勝手を良くしてみます．

ユーザ登録画面ではユーザ名をパスワードを入力し，Server-side アプリケーションへ送信することでユーザ登録処理を行っています．
このとき，それぞれのフィールドが非空文字列であることは `required` 属性によってチェックされていますが，ユーザ名の重複が発生した際はエラーページだけが表示される不親切な設計となっています．

よくある実用的なアプリケーションでは，ユーザ名の重複がある際には入力画面上にエラー文を表示し，別のユーザ名を入力するよう誘導する仕組みを備えていることが多いです．
todolist.go にもそのような機能を実装し，エラーの内容をわかりやすく表示したうえで再入力を促すフォームを作成してみます．

### エラー表示エリアの配置
まずはエラーを表示する場所を確保するため，todolist.go/views/new\_user\_form.html を以下のように修正します．
先に実装したものに対し主に 3〜5&nbsp;行目の記述を追加しました．
また，各入力フィールドに `value` 属性を追加し，最後の入力値を引き継げるようにしています．

<span class="filename">todolist.go/views/new\_user\_form.html</span>
```html
{{ template "header" . }}
<h1>ユーザ登録</h1>
{{ if .Error }}
<p><font color="#FF0000">{{ .Error }}</font><p>
{{ end }}
<form action="/user/new" method="POST">
    <label>ユーザ名: </label><input type="text" name="username" value="{{ .Username }}"required><br>
    <label>パスワード: </label><input type="text" name="password" value="{{ .Password }}" required><br>
    <input type="submit" value="登録">
</form>
{{ template "footer" }}
```

3〜5&nbsp;行目は，`.Error` が値を持っていれば，4 行目に示すエラー表示エリア (`<p>` タグ) を有効化するものです．
すなわち，`.Error` が `nil` でない場合，あるいは `.Error` が空文字でない場合にのみ，エラー表示エリアが有効化されます．
エラー表示なので `<font>` タグを用いて <font color="#FF0000">赤色</font> で表示するようにしています．

`value="{{ .Username }}"` および `value="{{ .Password }}"` の部分についても，値が渡されなければ空文字列，すなわち共に `value=""` となるので問題ありません．

このように，値がある場合のみ有効化されるタグを配置しておき，エラー文やメッセージが存在する場合のみ表示する技法はたびたび需要があるので，覚えておくと良いかもしれません．

### エラーの送出
エラー表示エリアを確保したので，次はエラー文を埋め込む方法を考えます．
このフォームは /user/new への GET リクエストを処理した結果として表示される画面として作成しました．
しかしながら，初回アクセス時は単純にフォームを表示するだけなので，エラーは何も表示されないはずです．
したがって，`service.NewUserForm` 関数は特に修正する必要がありません．

ユーザ登録処理を追えばわかる通り，エラー文が表示されるのは /user/new への POST リクエストを処理する途中でエラーが発生した場合です．
すなわち，`service.RegiterUser` 関数実行中のエラーを補足し，エラー文を構成した上でこのフォームを送り返してあげればよさそうです．

以下に実装例を示します．

<span class="filename">todolist.go/service/user.go</span>
```go
...
func RegisterUser(ctx *gin.Context) {
    // フォームデータの受け取り
    username := ctx.PostForm("username")
    password := ctx.PostForm("password")
    switch {
    case username == "":
        ctx.HTML(http.StatusBadRequest, "new_user_form.html", gin.H{"Title": "Register user", "Error": "Usernane is not provided", "Username": username})
    case password == "":
        ctx.HTML(http.StatusBadRequest, "new_user_form.html", gin.H{"Title": "Register user", "Error": "Password is not provided", "Password": password})
    }
    
    // DB 接続
    db, err := database.GetConnection()
    if err != nil {
		Error(http.StatusInternalServerError, err.Error())(ctx)
		return
    }

    // 重複チェック
    var duplicate int
    err = db.Get(&duplicate, "SELECT COUNT(*) FROM users WHERE name=?", username)
    if err != nil {
		Error(http.StatusInternalServerError, err.Error())(ctx)
		return
    }
    if duplicate > 0 {
        ctx.HTML(http.StatusBadRequest, "new_user_form.html", gin.H{"Title": "Register user", "Error": "Username is already taken", "Username": username, "Password": password})
        return
    }
    // DB への保存
    ...
```

1&nbsp;つめ修正点は 6〜11&nbsp;行目です．
修正前は以下のようにユーザ名かパスワードのいずれかが空文字列であればエラー画面を表示するコードでした．
```go
    if username == "" || password == "" {
        Error(http.StatusBadRequest, "Empty parameter")(ctx)
        return
    }
```
これを switch 文を使用してエラーの種類を識別し，以下のように適切なエラー文を表示するよう修正しています．
```go
    switch {
    case username == "":
        ctx.HTML(http.StatusBadRequest, "new_user_form.html", gin.H{"Title": "Register user", "Error": "Username is not provided", "Username": username})
    case password == "":
        ctx.HTML(http.StatusBadRequest, "new_user_form.html", gin.H{"Title": "Register user", "Error": "Password is not provided", "Password": password})
    }
```

2&nbsp;つめの修正点として 21〜30&nbsp;行目のコードを追加しました．
これはユーザ名の重複を確認するコードであり，変数 `username` がすでに登録されているユーザ名である場合に，`duplicate > 0` が成立するためエラー文が表示される仕組みになっています．
ただし，ユーザ名の重複以外の理由でエラーになる場合は `err != nil` のブロックが有効になり，こちらは内部エラーとして処理するようにしています．
ちなみに，ここはもう少し効率的な記述方法があるかもしれませんので，もし知っている人やアイデアのある方は教えてください．
DB への保存時に UNIQUE 制約違反のエラーをキャプチャしても良いのですが，他のエラーとの区別が面倒だったのでとりあえず別処理にしています．

これらの機能の動作確認として，重複するユーザ名を登録した時にどのような画面表示がなされるかを確認してみましょう．

##### 練習問題 9-3
よくあるアカウント登録ページでは，パスワードを 2 回入力させることで，タイプミスによって認証できなくなる事態を防いでいます．
本アプリケーションでも同様の仕組みを実装し，パスワードの入力にミスがある場合にはエラーを表示するよう実装を修正してみましょう．

##### 練習問題 9-4 (少し発展的内容)
現在の実装ではパスワードの文字列や複雑さについて一切のチェック機能がありません．
そこで，短すぎるパスワードや数字だけのパスワードを無効化するよう `service.RegisterUser` 関数を修正し，そうしたパスワードが入力された場合にはエラーを表示してみましょう．

## まとめ
今回はユーザを扱うための基礎的な仕組みを追加しました．
また，アプリケーションのセキュリティを高める工夫として，パスワードをハッシュ化 (ダイジェスト化) して保管することでデータ漏洩への対策を組み込みました．
ここでは実装上の基礎的な考え方を学ぶために単純なパスワード保護の方法をとりましたが，実用的なアプリケーションでは多重ハッシュ化や salt のランダム化などによって，より強固な方法を実装する必要があります．
次回の内容にて触れますが，現実的には認証部分をより安全な外部サービスに委託するケースも多いので，そうしたサービスについて調べてみるのも良いかと思います．

次回はログイン・ログアウト処理およびタスクとユーザの紐づけを実装し，ユーザごとにタスクを管理できる実践的なアプリケーションとして todolist.go の基本仕様の開発を進めます．

今回の内容は以上です．
おつかれさまでした．
